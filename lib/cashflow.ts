// The dashboard's data, from Quotely's own tables (not the raw PayPal endpoints). Server-only.
// Everything returned is plain JSON: it is passed to a client component.
//
// - receivables, payments, weeks: rows for AG Studio's data engine (native KPI, line, grid and
//   donut widgets). Money is in euros there, because Studio formats and sums plain numbers.
// - debtors, funnel, nudges: ready-made view models for the three custom widgets. Money in cents.

import type { QuoteState, ReminderOutcome, ReminderRuleKey } from '@prisma/client';
import { addDays, daysBetween, formatDay, isoDay } from './dates';
import { db } from './db';
import { STATE_LABEL } from './quote-state';

const euros = (cents: number) => Math.round(cents) / 100;

/** Monday of the week containing `day` (YYYY-MM-DD). */
const weekOf = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
};

export type DebtorRow = {
  quoteId: string;
  quoteNumber: string;
  company: string;
  amountCents: number;
  state: QuoteState;
  dueDate: string;
  daysOverdue: number;
};

export type FunnelStep = { label: string; count: number; amountCents: number };

export type NudgeEvent = {
  id: string;
  quoteId: string;
  outcome: ReminderOutcome;
  rule: ReminderRuleKey;
  customer: string;
  amountCents: number;
  reason: string | null;
  at: string;
  scheduledFor: string | null;
};

export async function getCashflowData(now = new Date()) {
  const today = isoDay(now);
  const month = today.slice(0, 7);

  const invoices = await db.invoice.findMany({
    where: { status: { in: ['sent', 'paid'] } },
    include: {
      quote: { include: { customer: { select: { company: true } } } },
      reminders: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  // --- Receivables ledger (open invoices)
  const open = invoices.filter((i) => i.status === 'sent');
  const receivables = open.map((i) => {
    const late = Math.max(0, daysBetween(i.dueDate, now));
    const owed = i.amountCents - i.paidCents;
    const r = i.reminders[0];
    const reminderStatus = !r
      ? 'No reminder yet'
      : r.outcome === 'scheduled' && r.scheduledFor
        ? `Next: ${formatDay(r.scheduledFor)}`
        : r.outcome === 'sent'
          ? `Sent ${formatDay(r.createdAt)}`
          : r.outcome === 'failed'
            ? 'Failed · retrying'
            : `Skipped · ${r.reason ?? ''}`.trim();
    return {
      id: i.id,
      quoteId: i.quoteId,
      quote: i.quote.number,
      customer: i.quote.customer.company,
      invoice: i.number,
      kind: i.kind === 'deposit' ? 'Deposit' : 'Balance',
      // "Overdue" in the text keeps the pill readable without colour (and drives the row tint).
      stage: `${STATE_LABEL[i.quote.state]}${late > 0 ? ` · Overdue ${late}d` : ''}`,
      amountOwed: euros(owed),
      overdueAmount: late > 0 ? euros(owed) : 0,
      dueDate: isoDay(i.dueDate),
      daysOverdue: late,
      reminderStatus,
    };
  });

  // --- Payments received
  const paid = invoices.filter((i) => i.status === 'paid' && i.paidAt);
  const payments = paid.map((i) => {
    const day = isoDay(i.paidAt!);
    const thisMonth = day.slice(0, 7) === month;
    return {
      id: i.id,
      quote: i.quote.number,
      customer: i.quote.customer.company,
      kind: i.kind === 'deposit' ? 'Deposits' : 'Balances',
      amount: euros(i.amountCents),
      paidDate: day,
      depositsThisMonth: thisMonth && i.kind === 'deposit' ? euros(i.amountCents) : 0,
      balancesThisMonth: thisMonth && i.kind === 'balance' ? euros(i.amountCents) : 0,
      collectedThisMonth: thisMonth ? euros(i.amountCents) : 0,
    };
  });

  // --- Cash movement by week: 8 weeks back, 3 ahead
  const firstWeek = weekOf(addDays(today, -7 * 7));
  const weeks = Array.from({ length: 11 }, (_, n) => addDays(firstWeek, 7 * n)).map((weekStart) => {
    const weekEnd = addDays(weekStart, 7);
    const inWeek = (day: string) => day >= weekStart && day < weekEnd;
    let deposits = 0;
    let balances = 0;
    let expected = 0;
    for (const i of invoices) {
      if (inWeek(isoDay(i.dueDate))) expected += i.amountCents;
      if (i.status === 'paid' && i.paidAt && inWeek(isoDay(i.paidAt))) {
        if (i.kind === 'deposit') deposits += i.amountCents;
        else balances += i.amountCents;
      }
    }
    return {
      id: weekStart,
      weekStart,
      depositsReceived: euros(deposits),
      balancesReceived: euros(balances),
      expected: euros(expected),
    };
  });

  // --- Who owes what: overdue first (most late first), then nearest due, then largest
  const debtors: DebtorRow[] = open
    .map((i) => ({
      quoteId: i.quoteId,
      quoteNumber: i.quote.number,
      company: i.quote.customer.company,
      amountCents: i.amountCents - i.paidCents,
      state: i.quote.state,
      dueDate: isoDay(i.dueDate),
      daysOverdue: Math.max(0, daysBetween(i.dueDate, now)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate) || b.amountCents - a.amountCents);

  // --- Money-flow funnel over every approved quote
  const quotes = await db.quote.findMany({ where: { state: { not: 'draft' } }, select: { state: true, totalCents: true, depositCents: true } });
  const depositSecured = quotes.filter((q) => ['deposit_paid', 'in_progress', 'balance_due', 'paid'].includes(q.state));
  const fullyPaid = quotes.filter((q) => q.state === 'paid');
  const funnel: FunnelStep[] = [
    { label: 'Approved quotes', count: quotes.length, amountCents: quotes.reduce((s, q) => s + q.totalCents, 0) },
    { label: 'Deposits received', count: depositSecured.length, amountCents: depositSecured.reduce((s, q) => s + q.depositCents, 0) },
    { label: 'Fully paid', count: fullyPaid.length, amountCents: fullyPaid.reduce((s, q) => s + q.totalCents, 0) },
  ];

  // --- Nudge agent activity: the latest four things it did
  const latest = await db.reminder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 4,
    include: { quote: { include: { customer: { select: { company: true } } } } },
  });
  const nudges: NudgeEvent[] = latest.map((r) => ({
    id: r.id,
    quoteId: r.quoteId,
    outcome: r.outcome,
    rule: r.rule,
    customer: r.quote.customer.company,
    amountCents: r.amountCents,
    reason: r.reason,
    at: r.createdAt.toISOString(),
    scheduledFor: r.scheduledFor?.toISOString() ?? null,
  }));

  return { asOf: now.toISOString(), today, receivables, payments, weeks, debtors, funnel, nudges };
}

export type CashflowData = Awaited<ReturnType<typeof getCashflowData>>;
