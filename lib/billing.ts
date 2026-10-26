// Quote-to-cash with PayPal: approving a quote, issuing one deposit and one balance invoice per
// quote, and recording payments. Server-only.
//
// Guarantees:
// - One invoice per stage. The Invoice row is reserved first (unique on quoteId + kind), so a
//   double click or a retry finds the existing row instead of creating another.
// - A retry never creates a second PayPal invoice. If a PayPal id was stored, it is re-read;
//   if not, PayPal is searched by our unique invoice number before anything is created.
// - Paid means PayPal says PAID. Webhooks and polling both end in markInvoicePaid(), which
//   re-checks the PayPal invoice and is safe to call any number of times.

import { Prisma, type Actor, type InvoiceKind } from '@prisma/client';
import { DAY_MS, isoDay } from './dates';
import { db } from './db';
import { dayToDate } from './drafting';
import { centsToDecimal, formatMoney } from './money';
import {
  createDraftInvoice,
  findInvoicesByNumber,
  getInvoice,
  PayPalApiError,
  sendInvoice,
  type Invoice as PayPalInvoice,
} from './paypal';
import { draftTotals, validateDraft } from './quote-draft';

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid_state' | 'invalid_quote' | 'paypal',
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

const SEEDED = 'This is demo data and is not connected to PayPal. Create a quote from a request to invoice for real.';

const LABEL: Record<InvoiceKind, string> = { deposit: 'Deposit', balance: 'Balance' };
const toCents = (value: string | undefined) => Math.round(Number(value ?? '0') * 100);

function activity(quoteId: string, actor: Actor, type: string, message: string, meta?: Record<string, unknown>) {
  return db.activity.create({ data: { quoteId, actor, type, message, meta: meta ? JSON.stringify(meta) : null } });
}

// --- Approval ------------------------------------------------------------------------

/**
 * Approves a draft (validated again from the database, not from the browser), then creates and
 * sends the deposit invoice. If PayPal fails, the quote stays approved and the invoice can be
 * retried with issueInvoice().
 */
export async function approveQuote(quoteId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { customer: true, lines: { orderBy: { position: 'asc' } } } });
  if (!quote) throw new BillingError('Quote not found', 'not_found');
  if (quote.seeded) throw new BillingError(SEEDED, 'invalid_state');

  if (quote.state === 'draft') {
    const draft = {
      title: quote.title,
      location: quote.location ?? '',
      jobStartDate: quote.jobStartDate ? isoDay(quote.jobStartDate) : null,
      jobEndDate: quote.jobEndDate ? isoDay(quote.jobEndDate) : null,
      depositPercent: quote.depositPercent,
      depositDueDate: quote.depositDueDate ? isoDay(quote.depositDueDate) : null,
      customer: { company: quote.customer.company, contactName: quote.customer.contactName ?? '', email: quote.customer.email },
      lines: quote.lines,
    };
    const { blockers } = validateDraft(draft, isoDay(new Date()));
    if (blockers.length) throw new BillingError(blockers.join(' · '), 'invalid_quote');

    const totals = draftTotals(draft);
    // Conditional update: only one approval wins if two arrive together.
    const { count } = await db.quote.updateMany({
      where: { id: quoteId, state: 'draft' },
      data: { state: 'approved', approvedAt: new Date(), ...totals },
    });
    if (count === 1) {
      await activity(quoteId, 'operator', 'quote.approved', `Quote approved · ${formatMoney(totals.totalCents)}`, totals);
    }
  } else if (quote.state !== 'approved') {
    // Already past approval: the deposit invoice exists. Nothing to do.
    return db.invoice.findUnique({ where: { quoteId_kind: { quoteId, kind: 'deposit' } } });
  }

  return issueInvoice(quoteId, 'deposit');
}

/** Marks the job complete and issues the balance invoice (due in 7 days unless a date is given). */
export async function completeJob(quoteId: string, dueDate?: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new BillingError('Quote not found', 'not_found');
  if (quote.seeded) throw new BillingError(SEEDED, 'invalid_state');
  if (quote.state !== 'deposit_paid' && quote.state !== 'in_progress') {
    if (quote.state === 'balance_due' || quote.state === 'paid') {
      return db.invoice.findUnique({ where: { quoteId_kind: { quoteId, kind: 'balance' } } });
    }
    throw new BillingError('The deposit must be paid before the job can be completed.', 'invalid_state');
  }
  if (!quote.completedAt) {
    const { count } = await db.quote.updateMany({ where: { id: quoteId, completedAt: null }, data: { completedAt: new Date() } });
    if (count === 1) await activity(quoteId, 'operator', 'job.completed', 'Job marked complete');
  }
  return issueInvoice(quoteId, 'balance', dueDate);
}

// --- Invoices ------------------------------------------------------------------------

/** "Q-1042-D-7K2Q": readable, and unique in the PayPal account even after the local database is reseeded. */
const invoiceNumber = (quoteNumber: string, kind: InvoiceKind) =>
  `${quoteNumber}-${kind === 'deposit' ? 'D' : 'B'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/** Reserves the invoice row for this stage, or returns the one already there. */
async function reserveInvoice(quoteId: string, kind: InvoiceKind, dueDate?: string) {
  const existing = await db.invoice.findUnique({ where: { quoteId_kind: { quoteId, kind } } });
  if (existing) return existing;

  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const amountCents = kind === 'deposit' ? quote.depositCents : quote.balanceCents;
  const due =
    kind === 'deposit'
      ? (quote.depositDueDate ?? dayToDate(isoDay(new Date(Date.now() + 7 * DAY_MS)))!)
      : dayToDate(dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : isoDay(new Date(Date.now() + 7 * DAY_MS)))!;
  try {
    return await db.invoice.create({
      data: { quoteId, kind, status: 'creating', number: invoiceNumber(quote.number, kind), amountCents, dueDate: due },
    });
  } catch (err) {
    // Lost a race with a concurrent request: use the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return db.invoice.findUniqueOrThrow({ where: { quoteId_kind: { quoteId, kind } } });
    }
    throw err;
  }
}

/**
 * Creates (if needed) and sends the invoice for one stage. Safe to call again after any failure:
 * it picks up where the last attempt stopped and never duplicates the PayPal invoice.
 */
export async function issueInvoice(quoteId: string, kind: InvoiceKind, dueDate?: string) {
  const owner = await db.quote.findUnique({ where: { id: quoteId }, select: { seeded: true } });
  if (!owner) throw new BillingError('Quote not found', 'not_found');
  if (owner.seeded) throw new BillingError(SEEDED, 'invalid_state');
  const row = await reserveInvoice(quoteId, kind, dueDate);
  if (row.seeded) return row;
  if (row.status === 'sent' || row.status === 'paid') return row;

  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { customer: true } });
  const label = LABEL[kind];
  let paypalId = row.paypalInvoiceId;

  try {
    // 1. Find or create the PayPal invoice.
    if (!paypalId) {
      const found = await findInvoicesByNumber(row.number);
      paypalId = found[0]?.id ?? null;
    }
    if (!paypalId) {
      const [givenName, ...rest] = (quote.customer.contactName ?? '').split(' ');
      const created = await createDraftInvoice(
        {
          invoiceNumber: row.number,
          dueDate: isoDay(row.dueDate),
          note:
            kind === 'deposit'
              ? `Deposit (${quote.depositPercent}%) to confirm ${quote.title}. Quote ${quote.number}, total ${formatMoney(quote.totalCents)}.`
              : `Balance for ${quote.title}, now complete. Quote ${quote.number}, total ${formatMoney(quote.totalCents)}; deposit already received.`,
          recipient: {
            email: quote.customer.email,
            businessName: quote.customer.company,
            givenName: givenName || undefined,
            surname: rest.join(' ') || undefined,
          },
          items: [
            {
              name: kind === 'deposit' ? `Deposit (${quote.depositPercent}%) · ${quote.title}` : `Balance · ${quote.title}`,
              description: `Quote ${quote.number}`,
              quantity: 1,
              unitAmount: centsToDecimal(row.amountCents),
            },
          ],
        },
        row.id,
      );
      paypalId = created.id;
    }
    await db.invoice.update({ where: { id: row.id }, data: { paypalInvoiceId: paypalId, status: 'draft', lastError: null } });

    // 2. Send it, unless PayPal says it already went out (e.g. our last update was lost).
    let invoice = await getInvoice(paypalId);
    if (invoice.status === 'DRAFT') {
      await sendInvoice(paypalId, `${row.id}-send`);
      invoice = await getInvoice(paypalId);
    }

    const sentAt = new Date();
    await db.$transaction([
      db.invoice.update({
        where: { id: row.id },
        data: {
          status: 'sent',
          sentAt,
          payerViewUrl: invoice.detail.metadata?.recipient_view_url ?? `https://www.sandbox.paypal.com/invoice/p/#${paypalId}`,
          lastSyncedAt: sentAt,
          lastError: null,
        },
      }),
      db.quote.updateMany({
        where: { id: quoteId, state: kind === 'deposit' ? 'approved' : { in: ['deposit_paid', 'in_progress'] } },
        data: { state: kind === 'deposit' ? 'deposit_due' : 'balance_due' },
      }),
      db.activity.create({
        data: {
          quoteId,
          actor: 'operator',
          type: 'invoice.sent',
          message: `${label} invoice sent · ${formatMoney(row.amountCents)} requested`,
          meta: JSON.stringify({ invoice: row.number, paypalInvoiceId: paypalId, amountCents: row.amountCents }),
        },
      }),
    ]);

    // A payment that landed between the sends and now is picked up straight away.
    if (invoice.status === 'PAID') await markInvoicePaid(paypalId, invoice);
    return db.invoice.findUniqueOrThrow({ where: { id: row.id } });
  } catch (err) {
    const message = err instanceof PayPalApiError ? err.message : err instanceof Error ? err.message : String(err);
    console.error(`[quotely] ${kind} invoice for ${quote.number} failed:`, message);
    // A PayPal invoice created before the failure stays linked (status draft), so a retry sends it
    // instead of creating another.
    await db.invoice.update({ where: { id: row.id }, data: { status: paypalId ? 'draft' : 'failed', lastError: message.slice(0, 500) } });
    await activity(quoteId, 'system', 'invoice.failed', `${label} invoice could not be sent. No payment was requested.`, { error: message.slice(0, 300) });
    throw new BillingError('PayPal couldn’t send this invoice. No payment was requested.', 'paypal');
  }
}

// --- Payments ------------------------------------------------------------------------

/**
 * When the customer paid. PayPal's payment_date is often a bare date ("2026-10-26"), which would
 * read as midnight UTC; then the moment we recorded the payment is the honest time. Never before
 * the invoice was sent, never in the future.
 */
export function paymentTime(confirmed: PayPalInvoice, sentAt: Date | null, now = new Date()): Date {
  const latest = confirmed.payments?.transactions
    ?.map((t) => t.payment_date)
    .filter((d): d is string => Boolean(d) && /T\d{2}:\d{2}/.test(d!) && !Number.isNaN(Date.parse(d!)))
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1);
  let at = latest ?? now;
  if (sentAt && at < sentAt) at = now < sentAt ? sentAt : now;
  return at > now ? now : at;
}

export type PaidResult = { changed: boolean; quoteId?: string; kind?: InvoiceKind; amountCents?: number; reason?: string };

/**
 * Records a payment, but only if PayPal confirms it: status PAID and paid amount at least the
 * invoice amount, in EUR. `confirmed` must be a fresh GET of the invoice from PayPal, never the
 * body of a webhook. Idempotent: a second call for the same invoice changes nothing.
 */
export async function markInvoicePaid(paypalInvoiceId: string, confirmed: PayPalInvoice, source: 'webhook' | 'poll' | 'send' = 'send'): Promise<PaidResult> {
  const row = await db.invoice.findUnique({ where: { paypalInvoiceId }, include: { quote: true } });
  if (!row) return { changed: false, reason: 'unknown invoice' };
  if (row.status === 'paid') return { changed: false, quoteId: row.quoteId, kind: row.kind, reason: 'already paid' };

  const paidCents = toCents(confirmed.payments?.paid_amount?.value);
  const currency = confirmed.payments?.paid_amount?.currency_code ?? confirmed.detail.currency_code;
  if (confirmed.id !== paypalInvoiceId || confirmed.status !== 'PAID' || currency !== 'EUR' || paidCents < row.amountCents) {
    return { changed: false, quoteId: row.quoteId, kind: row.kind, reason: `not paid (${confirmed.status}, ${paidCents} of ${row.amountCents})` };
  }

  const paidAt = paymentTime(confirmed, row.sentAt);
  const label = LABEL[row.kind];

  const changed = await db.$transaction(async (tx) => {
    // Only the first caller flips the row; everyone else sees count 0 and stops.
    const { count } = await tx.invoice.updateMany({
      where: { id: row.id, status: { not: 'paid' } },
      data: { status: 'paid', paidCents, paidAt, lastSyncedAt: new Date(), lastError: null },
    });
    if (count === 0) return false;

    const nextState = row.kind === 'deposit' ? 'deposit_paid' : 'paid';
    await tx.quote.updateMany({
      where: { id: row.quoteId, state: row.kind === 'deposit' ? { in: ['approved', 'deposit_due'] } : 'balance_due' },
      data: { state: nextState, ...(nextState === 'paid' ? { paidAt } : {}) },
    });
    await tx.activity.create({
      data: {
        quoteId: row.quoteId,
        actor: 'paypal',
        type: 'invoice.paid',
        at: paidAt,
        message: `${label} received · ${formatMoney(row.amountCents)} · Verified by PayPal`,
        meta: JSON.stringify({ invoice: row.number, paypalInvoiceId, paidCents, source }),
      },
    });
    return true;
  });

  if (changed) console.log(`[quotely] ${row.quote.number} ${row.kind} paid (${formatMoney(row.amountCents)}), confirmed via ${source}`);
  return { changed, quoteId: row.quoteId, kind: row.kind, amountCents: row.amountCents };
}

/** Records a cancellation that PayPal confirms. The quote keeps its state; the operator decides what next. */
export async function markInvoiceCancelled(paypalInvoiceId: string, confirmed: PayPalInvoice) {
  if (confirmed.status !== 'CANCELLED') return false;
  const row = await db.invoice.findUnique({ where: { paypalInvoiceId } });
  if (!row || row.status === 'cancelled' || row.status === 'paid') return false;
  const { count } = await db.invoice.updateMany({
    where: { id: row.id, status: { notIn: ['cancelled', 'paid'] } },
    data: { status: 'cancelled', lastSyncedAt: new Date() },
  });
  if (count === 1) {
    await activity(row.quoteId, 'paypal', 'invoice.cancelled', `${LABEL[row.kind]} invoice cancelled in PayPal`, { invoice: row.number });
  }
  return count === 1;
}

// --- Reconciliation --------------------------------------------------------------------

export type ReconcileResult = {
  checked: number;
  paid: { quoteId: string; kind: InvoiceKind; amountCents: number }[];
  cancelled: number;
  errors: { invoice: string; error: string }[];
};

let running: Promise<ReconcileResult> | null = null;

/**
 * Re-reads every live (non-seeded) unpaid invoice from PayPal and records payments and
 * cancellations. Concurrent calls share one run.
 */
export function reconcileOpenInvoices(): Promise<ReconcileResult> {
  running ??= (async () => {
    const open = await db.invoice.findMany({
      where: { seeded: false, paypalInvoiceId: { not: null }, status: { in: ['draft', 'sent'] } },
      select: { id: true, number: true, paypalInvoiceId: true },
    });
    const result: ReconcileResult = { checked: open.length, paid: [], cancelled: 0, errors: [] };
    for (const inv of open) {
      try {
        const remote = await getInvoice(inv.paypalInvoiceId!);
        if (remote.status === 'PAID') {
          const r = await markInvoicePaid(inv.paypalInvoiceId!, remote, 'poll');
          if (r.changed && r.quoteId && r.kind) result.paid.push({ quoteId: r.quoteId, kind: r.kind, amountCents: r.amountCents ?? 0 });
        } else if (remote.status === 'CANCELLED') {
          if (await markInvoiceCancelled(inv.paypalInvoiceId!, remote)) result.cancelled++;
        }
        await db.invoice.update({ where: { id: inv.id }, data: { lastSyncedAt: new Date() } });
      } catch (err) {
        result.errors.push({ invoice: inv.number, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      }
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** For the UI: amounts a paid invoice shows, kept here so the toast and timeline agree. */
export const describePayment = (kind: InvoiceKind, amountCents: number) =>
  kind === 'deposit' ? `${formatMoney(amountCents)} received. Deposit secured.` : `${formatMoney(amountCents)} received. Job fully paid.`;
