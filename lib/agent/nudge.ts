// The nudge agent: friendly payment reminders for unpaid deposits and overdue balances.
// Server-only. Runs from POST /api/agent/nudge (schedulers) and from the pages' 30-second timer.
//
// Rules (Settings > Reminder rules; offsets are days relative to the invoice due date):
//   deposit_unpaid   one reminder, `offsetDays` before the deposit is due (default -2)
//   balance_overdue  first reminder `offsetDays` after the balance was due (default +1),
//                    then every REPEAT_DAYS while it stays unpaid
// Reminders go out at 09:00 Milan time. A future one is logged as "scheduled"; when its time
// comes it becomes "sent" (or "failed", retried next run). Payment status is reconciled with
// PayPal first, and a scheduled reminder whose invoice was paid is "skipped: already paid".
//
// Nothing is emailed in v1: a "sent" reminder is the drafted email, logged and shown in the UI.

import type { Invoice, Quote, Customer, Reminder, ReminderRuleKey } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AiError, respondJson } from '../ai/respond';
import { REMINDER_INSTRUCTIONS, REMINDER_SCHEMA, reminderInput } from '../ai/prompts';
import { reconcileOpenInvoices } from '../billing';
import { addDays, daysBetween, formatDateRange, formatDateTime, isoDay, zonedTime } from '../dates';
import { db } from '../db';
import { formatMoney } from '../money';
import { reminderFooter } from './reminder-text';

export const SEND_HOUR = 9;
export const REPEAT_DAYS = 3;

const RULE_LABEL: Record<ReminderRuleKey, string> = {
  deposit_unpaid: 'Deposit reminder',
  balance_overdue: 'Overdue balance reminder',
};

export type NudgeResult = {
  ranAt: string;
  sent: number;
  scheduled: number;
  skipped: number;
  failed: number;
  reconcileErrors: number;
};

type Candidate = Invoice & { quote: Quote & { customer: Customer }; reminders: Reminder[] };

// --- The message -------------------------------------------------------------------------

async function draftReminder(inv: Candidate, rule: ReminderRuleKey, now: Date, previous: number) {
  const outstanding = inv.amountCents - inv.paidCents;
  const until = daysBetween(now, inv.dueDate);
  const timing =
    until > 0 ? `due in ${until} ${until === 1 ? 'day' : 'days'}` : until === 0 ? 'due today' : `${-until} ${-until === 1 ? 'day' : 'days'} past due`;
  const draft = await respondJson<{ subject: string; body: string }>({
    name: 'payment_reminder',
    instructions: REMINDER_INSTRUCTIONS,
    input: reminderInput({
      kind: inv.kind,
      rule,
      company: inv.quote.customer.company,
      contactName: inv.quote.customer.contactName,
      jobTitle: inv.quote.title,
      jobDates: formatDateRange(inv.quote.jobStartDate, inv.quote.jobEndDate),
      timing,
      previousReminders: previous,
    }),
    schema: REMINDER_SCHEMA,
  });
  const subject = draft.subject.trim().slice(0, 120) || `${inv.kind === 'deposit' ? 'Deposit' : 'Balance'} for ${inv.quote.title}`;
  const body = draft.body.trim().slice(0, 2_000);
  if (!body) throw new AiError('The AI returned an empty reminder.', 'invalid_output');
  const footer = reminderFooter({ amountCents: outstanding, dueDate: inv.dueDate, invoiceNumber: inv.number, payerViewUrl: inv.payerViewUrl });
  return { subject, message: `${body}\n\n${footer}`, timing };
}

// --- The run -----------------------------------------------------------------------------

const log = (quoteId: string, type: string, message: string, at?: Date) =>
  db.activity.create({ data: { quoteId, actor: 'agent', type, message, ...(at ? { at } : {}) } });

let running: Promise<NudgeResult> | null = null;

/** Runs the reminder rules once. Concurrent calls share the same run. */
export function runNudgeAgent({ reconcile = true, now = new Date() } = {}): Promise<NudgeResult> {
  running ??= run(reconcile, now).finally(() => {
    running = null;
  });
  return running;
}

async function run(reconcile: boolean, now: Date): Promise<NudgeResult> {
  const result: NudgeResult = { ranAt: now.toISOString(), sent: 0, scheduled: 0, skipped: 0, failed: 0, reconcileErrors: 0 };

  // 1. Latest payment status first: a reminder must never chase money already paid.
  if (reconcile) {
    const r = await reconcileOpenInvoices().catch(() => null);
    result.reconcileErrors = r ? r.errors.length : 1;
  }

  const rules = new Map((await db.reminderRule.findMany()).map((r) => [r.key, r]));
  const today = isoDay(now);

  // 2. Retire scheduled reminders that no longer apply.
  const pending = await db.reminder.findMany({ where: { outcome: 'scheduled' }, include: { invoice: true } });
  for (const r of pending) {
    const reason =
      !r.invoice || r.invoice.status === 'paid'
        ? 'already paid'
        : r.invoice.status === 'cancelled'
          ? 'invoice cancelled'
          : !rules.get(r.rule)?.enabled
            ? 'reminder rule turned off'
            : null;
    if (!reason) continue;
    await db.reminder.update({ where: { id: r.id }, data: { outcome: 'skipped', reason, scheduledFor: null } });
    await log(r.quoteId, 'reminder.skipped', `${RULE_LABEL[r.rule]} skipped · ${reason}`, now);
    result.skipped++;
  }

  // 3. Every unpaid, sent invoice gets its next reminder sent or scheduled.
  const invoices: Candidate[] = await db.invoice.findMany({
    where: { status: 'sent' },
    include: { quote: { include: { customer: true } }, reminders: { orderBy: { createdAt: 'asc' } } },
  });

  for (const inv of invoices) {
    const ruleKey: ReminderRuleKey = inv.kind === 'deposit' ? 'deposit_unpaid' : 'balance_overdue';
    const rule = rules.get(ruleKey);
    if (!rule?.enabled) continue;
    if (inv.quote.state === 'paid') continue;

    const mine = inv.reminders.filter((r) => r.rule === ruleKey);
    const sent = mine.filter((r) => r.outcome === 'sent');
    const lastSent = sent.at(-1);
    const ruleTarget =
      ruleKey === 'deposit_unpaid'
        ? sent.length
          ? null // one deposit reminder per invoice
          : addDays(isoDay(inv.dueDate), rule.offsetDays)
        : lastSent
          ? addDays(lastSent.day, REPEAT_DAYS)
          : addDays(isoDay(inv.dueDate), rule.offsetDays);
    if (!ruleTarget) continue;
    // Never nudge on the day the invoice itself went out (e.g. a deposit due tomorrow).
    const earliest = inv.sentAt ? addDays(isoDay(inv.sentAt), 1) : ruleTarget;
    const target = ruleTarget < earliest ? earliest : ruleTarget;
    const sendAt = zonedTime(target, SEND_HOUR);

    if (now < sendAt) {
      // Not yet: make sure the next one is on the schedule (once).
      if (mine.some((r) => r.day === target)) continue;
      try {
        await db.reminder.create({
          data: {
            quoteId: inv.quoteId,
            invoiceId: inv.id,
            rule: ruleKey,
            outcome: 'scheduled',
            amountCents: inv.amountCents - inv.paidCents,
            day: target,
            scheduledFor: sendAt,
          },
        });
        await log(inv.quoteId, 'reminder.scheduled', `${RULE_LABEL[ruleKey]} scheduled for ${formatDateTime(sendAt)}`, now);
        result.scheduled++;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
      continue;
    }

    // Due now. At most one reminder per rule per quote per day.
    const todays = mine.find((r) => r.day === today);
    if (todays && todays.outcome !== 'failed' && todays.outcome !== 'scheduled') continue;
    // A scheduled entry for the target day is the one being sent (it may be from an earlier day if a run was missed).
    const slot = todays ?? mine.find((r) => r.outcome === 'scheduled' && r.day === target);

    try {
      const draft = await draftReminder(inv, ruleKey, now, sent.length);
      const data = {
        outcome: 'sent' as const,
        reason: null,
        subject: draft.subject,
        message: draft.message,
        amountCents: inv.amountCents - inv.paidCents,
        day: today,
        scheduledFor: null,
        createdAt: now,
      };
      if (slot) await db.reminder.update({ where: { id: slot.id }, data });
      else await db.reminder.create({ data: { ...data, quoteId: inv.quoteId, invoiceId: inv.id, rule: ruleKey } });
      // Any older scheduled entry for this invoice is superseded by the reminder just sent.
      await db.reminder.deleteMany({ where: { invoiceId: inv.id, rule: ruleKey, outcome: 'scheduled', day: { lte: today } } });
      await log(inv.quoteId, 'reminder.sent', `${RULE_LABEL[ruleKey]} sent to ${inv.quote.customer.email} · ${formatMoney(inv.amountCents - inv.paidCents)} ${draft.timing}`, now);
      result.sent++;
    } catch (err) {
      const reason = err instanceof AiError ? 'AI draft failed; will retry on the next run' : 'Unexpected error; will retry on the next run';
      console.error(`[quotely] reminder for ${inv.quote.number} failed:`, err instanceof Error ? err.message : err);
      const data = { outcome: 'failed' as const, reason, amountCents: inv.amountCents - inv.paidCents, day: today, scheduledFor: null, createdAt: now };
      if (slot) await db.reminder.update({ where: { id: slot.id }, data });
      else await db.reminder.create({ data: { ...data, quoteId: inv.quoteId, invoiceId: inv.id, rule: ruleKey } });
      await log(inv.quoteId, 'reminder.failed', `${RULE_LABEL[ruleKey]} failed · ${reason}`, now);
      result.failed++;
    }
  }

  await db.appSetting.upsert({
    where: { key: 'agent.lastRun' },
    create: { key: 'agent.lastRun', value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });
  if (result.sent || result.scheduled || result.skipped || result.failed) {
    console.log(`[quotely] nudge agent: ${result.sent} sent, ${result.scheduled} scheduled, ${result.skipped} skipped, ${result.failed} failed`);
  }
  return result;
}
