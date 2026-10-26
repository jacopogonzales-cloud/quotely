// Reminder text that is the same everywhere: the factual footer the app appends under every
// AI-drafted reminder, and the sample shown in Settings. Pure and client-safe.

import type { ReminderRuleKey } from '@prisma/client';
import { formatDate } from '../dates';
import { formatMoney } from '../money';

/** The exact facts under every reminder. Written by the app, never by the model. */
export function reminderFooter(args: { amountCents: number; dueDate: Date | string; invoiceNumber: string; payerViewUrl: string | null }) {
  return [
    `Amount due: ${formatMoney(args.amountCents)}`,
    `Due date: ${formatDate(args.dueDate)}`,
    `Invoice: ${args.invoiceNumber}`,
    args.payerViewUrl ? `Pay securely with PayPal: ${args.payerViewUrl}` : 'Pay securely with the PayPal link in your invoice email.',
  ].join('\n');
}

/** Sample text for the Settings preview (no AI call). */
export function sampleReminder(rule: ReminderRuleKey, offsetDays: number) {
  const sample = { contact: 'Giulia', job: 'Client presentation, Via Tortona', amountCents: rule === 'deposit_unpaid' ? 84_000 : 196_000 };
  // The preview is "as if sent today", so the due date sits `offsetDays` away from today.
  const due = new Date(Date.now() - offsetDays * 86_400_000);
  const body =
    rule === 'deposit_unpaid'
      ? `Hi ${sample.contact},\n\nJust a friendly reminder that the deposit for ${sample.job} is due soon. Once it is in, your dates are fully confirmed. Let us know if you have any questions.\n\nBest regards,\nNorthstar Rentals`
      : `Hi ${sample.contact},\n\nThank you again for choosing us for ${sample.job}. Our records show the balance is still open; could you take a moment to settle it? If anything is holding it up, just reply and we will help.\n\nBest regards,\nNorthstar Rentals`;
  return {
    subject: rule === 'deposit_unpaid' ? `Deposit for ${sample.job}` : `Balance for ${sample.job}`,
    body: `${body}\n\n${reminderFooter({ amountCents: sample.amountCents, dueDate: due, invoiceNumber: rule === 'deposit_unpaid' ? 'Q-1042-D-QXT9' : 'Q-1042-B-HC3M', payerViewUrl: 'https://www.sandbox.paypal.com/invoice/p/#…' })}`,
    customer: 'Studio Marconi S.r.l.',
  };
}
