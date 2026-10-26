import { db } from '@/lib/db';
import { markInvoiceCancelled, markInvoicePaid } from '@/lib/billing';
import { getInvoice, verifyWebhookSignature } from '@/lib/paypal';

// POST /api/paypal/webhook: PayPal invoicing events.
//
// 1. The signature is verified with PayPal (PAYPAL_WEBHOOK_ID). Without a webhook id, events are
//    accepted in development only, with a warning.
// 2. Each event id is stored once, so redeliveries are no-ops.
// 3. The event body is never trusted: the invoice is fetched from PayPal and only a confirmed
//    PAID (or CANCELLED) status changes anything, through the same functions polling uses.
//
// Answering non-2xx makes PayPal retry, so errors that a retry could fix return 500.

const HANDLED = new Set(['INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.CANCELLED']);

type WebhookEvent = { id?: string; event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };

let warnedNoWebhookId = false;

export async function POST(request: Request) {
  const raw = await request.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  if (!event.id || !event.event_type) return Response.json({ error: 'Not a PayPal event' }, { status: 400 });

  // --- Authenticity
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  let verified = false;
  if (webhookId) {
    try {
      verified = await verifyWebhookSignature(
        {
          transmissionId: request.headers.get('paypal-transmission-id'),
          transmissionTime: request.headers.get('paypal-transmission-time'),
          transmissionSig: request.headers.get('paypal-transmission-sig'),
          certUrl: request.headers.get('paypal-cert-url'),
          authAlgo: request.headers.get('paypal-auth-algo'),
        },
        raw,
        webhookId,
      );
    } catch (err) {
      console.error('[quotely] webhook verification call failed:', err instanceof Error ? err.message : err);
      return Response.json({ error: 'Could not verify the signature right now' }, { status: 500 });
    }
    if (!verified) {
      console.warn(`[quotely] webhook ${event.id} rejected: signature did not verify`);
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[quotely] webhook rejected: PAYPAL_WEBHOOK_ID is not set');
    return Response.json({ error: 'Webhook verification is not configured' }, { status: 503 });
  } else if (!warnedNoWebhookId) {
    warnedNoWebhookId = true;
    console.warn('[quotely] PAYPAL_WEBHOOK_ID is not set: accepting webhook events WITHOUT signature verification (development only)');
  }

  // --- Deduplication
  const resourceId = event.resource?.id ?? event.resource?.invoice?.id ?? null;
  const seen = await db.webhookEvent.findUnique({ where: { id: event.id } });
  if (seen?.processed) return Response.json({ ok: true, duplicate: true });
  if (!seen) {
    await db.webhookEvent
      .create({ data: { id: event.id, type: event.event_type, resourceId, verified, payload: raw.slice(0, 50_000) } })
      .catch(() => undefined); // a concurrent delivery created it first
  }

  if (!HANDLED.has(event.event_type) || !resourceId) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { processed: true } });
    return Response.json({ ok: true, ignored: event.event_type });
  }

  // --- Confirm with PayPal, then apply
  try {
    const known = await db.invoice.findUnique({ where: { paypalInvoiceId: resourceId }, select: { id: true } });
    let outcome: unknown = 'not a Quotely invoice';
    if (known) {
      const confirmed = await getInvoice(resourceId);
      outcome =
        event.event_type === 'INVOICING.INVOICE.PAID'
          ? await markInvoicePaid(resourceId, confirmed, 'webhook')
          : { cancelled: await markInvoiceCancelled(resourceId, confirmed) };
    }
    await db.webhookEvent.update({ where: { id: event.id }, data: { processed: true, error: null } });
    return Response.json({ ok: true, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[quotely] webhook ${event.id} failed:`, message);
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 500) } });
    return Response.json({ error: 'Processing failed; PayPal will retry' }, { status: 500 });
  }
}
