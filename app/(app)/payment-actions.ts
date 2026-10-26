'use server';

// Server actions for invoicing and payment status. Single-operator app with no login (see
// ./actions.ts); every state change is re-validated in lib/billing.ts.

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { InvoiceKind } from '@prisma/client';
import { runNudgeAgent } from '@/lib/agent/nudge';
import { approveQuote, BillingError, completeJob, issueInvoice, reconcileOpenInvoices } from '@/lib/billing';
import { db } from '@/lib/db';
import type { ActionResult } from './actions';

const failure = (err: unknown): { ok: false; error: string } => {
  if (err instanceof BillingError) return { ok: false, error: err.message };
  console.error('[quotely] billing action failed:', err);
  return { ok: false, error: 'Something went wrong. Nothing was sent to PayPal twice; try again.' };
};

const refreshQuote = (quoteId: string) => {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath('/quotes');
};

export async function approveAndSendAction(quoteId: string): Promise<ActionResult<{ amountCents: number }>> {
  try {
    const invoice = await approveQuote(String(quoteId));
    refreshQuote(quoteId);
    return { ok: true, data: { amountCents: invoice?.amountCents ?? 0 } };
  } catch (err) {
    return failure(err);
  }
}

export async function retryInvoiceAction(quoteId: string, kind: InvoiceKind): Promise<ActionResult<{ amountCents: number }>> {
  if (kind !== 'deposit' && kind !== 'balance') return { ok: false, error: 'Unknown invoice' };
  try {
    const invoice = await issueInvoice(String(quoteId), kind);
    refreshQuote(quoteId);
    return { ok: true, data: { amountCents: invoice.amountCents } };
  } catch (err) {
    refreshQuote(quoteId);
    return failure(err);
  }
}

export async function completeJobAction(quoteId: string, dueDate: string): Promise<ActionResult<{ amountCents: number }>> {
  try {
    const invoice = await completeJob(String(quoteId), typeof dueDate === 'string' ? dueDate : undefined);
    refreshQuote(quoteId);
    return { ok: true, data: { amountCents: invoice?.amountCents ?? 0 } };
  } catch (err) {
    refreshQuote(quoteId);
    return failure(err);
  }
}

export type PaymentUpdate = { quoteId: string; quoteNumber: string; customer: string; kind: InvoiceKind; amountCents: number };

// Pages poll every 30 s; with several tabs open, PayPal is still asked at most every 10 s
// (2 s for a manual refresh), and the nudge agent runs at most once a minute.
let lastRun = 0;
let lastNudge = 0;

/**
 * Reconciles open invoices with PayPal, then reports every payment recorded after `since`
 * (by this run, an earlier one, or the webhook), so an open page learns about all of them.
 * The client passes back the returned `now` as the next `since`.
 */
export async function refreshPaymentsAction(
  since: string,
  manual = false,
): Promise<ActionResult<{ payments: PaymentUpdate[]; now: string }>> {
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return { ok: false, error: 'Bad timestamp' };
  const now = new Date();

  let failed = false;
  if (now.getTime() - lastRun >= (manual ? 2_000 : 10_000)) {
    lastRun = now.getTime();
    try {
      const result = await reconcileOpenInvoices();
      failed = result.checked > 0 && result.errors.length === result.checked;
    } catch (err) {
      console.error('[quotely] reconcile failed:', err);
      failed = true;
    }
  }

  // The nudge agent rides on the same timer (at most once a minute), right after reconciling,
  // so reminders always see the latest payment status. It drafts with AI, so it runs after the
  // response: the page learns about payments without waiting for reminder drafts.
  if (now.getTime() - lastNudge >= 60_000) {
    lastNudge = now.getTime();
    after(() => runNudgeAgent({ reconcile: false }).catch((err) => console.error('[quotely] nudge agent failed:', err)));
  }

  // markInvoicePaid stamps lastSyncedAt when it records a payment; paid invoices are not re-synced after.
  const paid = await db.invoice.findMany({
    where: { status: 'paid', seeded: false, lastSyncedAt: { gt: sinceDate, lte: now } },
    select: { kind: true, amountCents: true, quote: { select: { id: true, number: true, customer: { select: { company: true } } } } },
  });
  const payments = paid.map((p) => ({
    quoteId: p.quote.id,
    quoteNumber: p.quote.number,
    customer: p.quote.customer.company,
    kind: p.kind,
    amountCents: p.amountCents,
  }));
  if (failed && payments.length === 0) {
    return { ok: false, error: 'Payment status couldn’t be refreshed. Your invoice remains unchanged.' };
  }
  return { ok: true, data: { payments, now: now.toISOString() } };
}

/** Settings > Reminder rules: run the agent now and report what it did. */
export async function runNudgeNowAction(): Promise<ActionResult<{ sent: number; scheduled: number; skipped: number; failed: number }>> {
  try {
    const r = await runNudgeAgent();
    revalidatePath('/settings');
    revalidatePath('/quotes');
    return { ok: true, data: { sent: r.sent, scheduled: r.scheduled, skipped: r.skipped, failed: r.failed } };
  } catch (err) {
    console.error('[quotely] nudge agent failed:', err);
    return { ok: false, error: 'The agent couldn’t run. Nothing was sent.' };
  }
}
