// The quote state model, shared by server and client. Pure functions over plain data: no database access.
//
//   draft -> approved -> deposit_due -> deposit_paid (= in_progress) -> balance_due -> paid
//
// `overdue` is not a stage. It is a flag computed from the open invoice's due date.

import type { InvoiceKind, InvoiceStatus, QuoteState } from '@prisma/client';
import { formatMoney } from './money';
import { daysBetween, formatDay } from './dates';

export type { QuoteState };

export const STATE_LABEL: Record<QuoteState, string> = {
  draft: 'Draft',
  approved: 'Approved',
  deposit_due: 'Deposit due',
  deposit_paid: 'Deposit paid',
  in_progress: 'In progress',
  balance_due: 'Balance due',
  paid: 'Paid',
};

/** Tailwind token suffix for each state's pill colour (see app/globals.css, --state-*). */
export const STATE_TONE: Record<QuoteState, string> = {
  draft: 'draft',
  approved: 'sent',
  deposit_due: 'deposit-due',
  deposit_paid: 'deposit-paid',
  in_progress: 'in-progress',
  balance_due: 'balance-due',
  paid: 'paid',
};

/** The stage rail on the quote detail page. */
export const STAGES = [
  { key: 'approved', label: 'Quote approved' },
  { key: 'deposit_paid', label: 'Deposit paid' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'balance_due', label: 'Balance due' },
  { key: 'paid', label: 'Paid' },
] as const;

/** How many stages of the rail are complete (0 = draft, 5 = paid). */
export function stageProgress(state: QuoteState): number {
  switch (state) {
    case 'draft':
      return 0;
    case 'approved':
    case 'deposit_due':
      return 1;
    case 'deposit_paid':
    case 'in_progress':
      return 3; // in_progress is an alias of deposit_paid in v1
    case 'balance_due':
      return 4;
    case 'paid':
      return 5;
  }
}

export const isAwaitingPayment = (state: QuoteState) => state === 'deposit_due' || state === 'balance_due';
export const isDepositSecured = (state: QuoteState) =>
  state === 'deposit_paid' || state === 'in_progress' || state === 'balance_due' || state === 'paid';

type InvoiceLike = { kind: InvoiceKind; status: InvoiceStatus; dueDate: Date | string; amountCents: number; paidCents: number };
type QuoteLike = {
  state: QuoteState;
  depositCents: number;
  balanceCents: number;
  totalCents: number;
  jobEndDate?: Date | string | null;
  paidAt?: Date | string | null;
  invoices: InvoiceLike[];
};

/** The invoice the customer currently owes, if any. */
export function openInvoice(quote: QuoteLike): InvoiceLike | undefined {
  const kind: InvoiceKind | undefined =
    quote.state === 'deposit_due' ? 'deposit' : quote.state === 'balance_due' ? 'balance' : undefined;
  return kind ? quote.invoices.find((i) => i.kind === kind && i.status !== 'paid' && i.status !== 'cancelled') : undefined;
}

/** Days past due of the open invoice; 0 when nothing is overdue. */
export function daysOverdue(quote: QuoteLike, now = new Date()): number {
  const invoice = openInvoice(quote);
  if (!invoice) return 0;
  return Math.max(0, daysBetween(invoice.dueDate, now));
}

export const isOverdue = (quote: QuoteLike, now = new Date()) => daysOverdue(quote, now) > 0;

/** Money received so far, in cents. */
export function collectedCents(quote: QuoteLike) {
  return quote.invoices.reduce((sum, i) => sum + (i.status === 'paid' ? i.amountCents : 0), 0);
}

/** Money billed and not yet received, in cents. */
export function outstandingCents(quote: QuoteLike) {
  const invoice = openInvoice(quote);
  return invoice ? invoice.amountCents - invoice.paidCents : 0;
}

/** Human next step for the quotes list: what should happen next, not a repeat of the state. */
export function nextAction(quote: QuoteLike, now = new Date()): string {
  const invoice = openInvoice(quote);
  switch (quote.state) {
    case 'draft':
      return 'Review and approve';
    case 'approved':
      return 'Send deposit invoice';
    case 'deposit_due':
    case 'balance_due': {
      const what = quote.state === 'deposit_due' ? 'deposit' : 'balance';
      if (!invoice) return `Send ${what} invoice`;
      const late = daysOverdue(quote, now);
      if (late > 0) return `Chase ${formatMoney(invoice.amountCents - invoice.paidCents)} · ${late} ${late === 1 ? 'day' : 'days'} late`;
      return `Waiting for ${what} · due ${formatDay(invoice.dueDate)}`;
    }
    case 'deposit_paid':
    case 'in_progress':
      return quote.jobEndDate && daysBetween(quote.jobEndDate, now) < 0
        ? `Job on ${formatDay(quote.jobEndDate)}, then send balance`
        : 'Mark complete & send balance';
    case 'paid':
      return quote.paidAt ? `Settled ${formatDay(quote.paidAt)}` : 'Settled';
  }
}
