import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { Activity, Invoice, Reminder } from '@prisma/client';
import { AlertIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, ClockIcon, ExternalIcon, MailIcon, PinIcon, SkipIcon, SparkIcon } from '@/components/icons';
import { PaymentWatcher } from '@/components/payment-watcher';
import { Badge, Card, CardTitle, Label, OverduePill, StatePill, cx } from '@/components/ui';
import { DAY_MS, formatDate, formatDateRange, formatDateTime, isoDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { getQuote } from '@/lib/queries';
import { db } from '@/lib/db';
import { STAGES, daysOverdue, stageProgress } from '@/lib/quote-state';
import { QuoteActions } from './quote-actions';

export async function generateMetadata({ params }: PageProps<'/quotes/[id]'>): Promise<Metadata> {
  const quote = await getQuote((await params).id);
  return { title: quote ? `${quote.number} · ${quote.customer.company}` : 'Quote' };
}

const merchantUrl = (paypalInvoiceId: string) => `https://www.sandbox.paypal.com/invoice/details/${paypalInvoiceId}`;

export default async function QuotePage({ params }: PageProps<'/quotes/[id]'>) {
  await connection();
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();
  // Drafts are edited in the builder.
  if (quote.state === 'draft' && quote.requestId) redirect(`/quotes/new?request=${quote.requestId}`);

  const now = new Date();
  const late = daysOverdue(quote, now);
  const deposit = quote.invoices.find((i) => i.kind === 'deposit');
  const balance = quote.invoices.find((i) => i.kind === 'balance');

  // A PayPal "paid" notification that arrived but isn't confirmed yet (the webhook re-reads the
  // invoice from PayPal first; if that call failed, PayPal retries). Never shown as paid until then.
  const openPayPalIds = quote.invoices.filter((i) => i.paypalInvoiceId && i.status !== 'paid').map((i) => i.paypalInvoiceId!);
  const verifying =
    openPayPalIds.length > 0 &&
    (await db.webhookEvent.count({ where: { type: 'INVOICING.INVOICE.PAID', processed: false, resourceId: { in: openPayPalIds } } })) > 0;

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <div className="flex items-center justify-between">
        <Link href="/quotes" className="inline-flex w-fit items-center gap-1 text-[13px] font-[650] text-fg-2 hover:text-fg">
          <ChevronLeftIcon className="size-4" /> Quotes & jobs
        </Link>
        {!quote.seeded && <PaymentWatcher quoteId={quote.id} />}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-fg-3">{quote.number}</span>
            <StatePill state={quote.state} />
            {late > 0 && <OverduePill days={late} />}
            {quote.seeded && <Badge>Demo data · not connected to PayPal</Badge>}
          </div>
          <h1 className="mt-1 text-[26px] leading-[34px] font-[750] text-fg">{quote.customer.company}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-2">
            <span className="font-[650] text-fg">{quote.title}</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-4 text-fg-3" /> {formatDateRange(quote.jobStartDate, quote.jobEndDate)}
            </span>
            {quote.location && (
              <span className="inline-flex items-center gap-1.5">
                <PinIcon className="size-4 text-fg-3" /> {quote.location}
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <Label>Quote total</Label>
          <div className="font-mono text-[24px] leading-[30px] font-semibold text-fg">{formatMoney(quote.totalCents)}</div>
        </div>
      </header>

      <StageRail progress={stageProgress(quote.state)} />

      <div className="grid grid-cols-[minmax(0,736px)_404px] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          {verifying && (
            <Card className="flex items-center gap-3 border-state-sent/40 px-5 py-4" role="status">
              <span className="size-4 animate-spin rounded-full border-2 border-state-sent/30 border-t-state-sent" aria-hidden />
              <span className="font-[650] text-fg">Payment notification received · Verifying with PayPal</span>
            </Card>
          )}
          <QuoteActions
            quote={{
              id: quote.id,
              state: quote.state,
              seeded: quote.seeded,
              customer: quote.customer.company,
              email: quote.customer.email,
              depositCents: quote.depositCents,
              balanceCents: quote.balanceCents,
              depositPercent: quote.depositPercent,
              completed: Boolean(quote.completedAt),
              paidAt: quote.paidAt?.toISOString() ?? null,
              defaultBalanceDue: isoDay(new Date(now.getTime() + 7 * DAY_MS)),
              today: isoDay(now),
              lateDays: late,
              nextReminder: nextReminderLabel(quote.reminders),
            }}
            deposit={deposit ? invoiceSummary(deposit) : null}
            balance={balance ? invoiceSummary(balance) : null}
          />
          <Timeline quote={quote} activities={quote.activities} recentSince={now.getTime() - 120_000} />
          <LineItems lines={quote.lines} totalCents={quote.totalCents} />
        </div>

        <div className="flex flex-col gap-5">
          <PaymentBreakdown deposit={deposit} balance={balance} depositCents={quote.depositCents} balanceCents={quote.balanceCents} />
          <Invoices invoices={quote.invoices} />
          <Reminders reminders={quote.reminders} />
        </div>
      </div>
    </div>
  );
}

/** "Reminder scheduled for 29 Oct, 09:00", from the agent's real schedule. */
function nextReminderLabel(reminders: Reminder[]) {
  const next = reminders
    .filter((r) => r.outcome === 'scheduled' && r.scheduledFor)
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())[0];
  return next ? `Reminder scheduled for ${formatDateTime(next.scheduledFor!)}` : null;
}

const invoiceSummary = (i: Invoice) => ({
  status: i.status,
  amountCents: i.amountCents,
  dueDate: i.dueDate.toISOString(),
  payerViewUrl: i.payerViewUrl,
  lastError: i.lastError,
});

// --- Stage rail ------------------------------------------------------------------------

function StageRail({ progress }: { progress: number }) {
  return (
    <Card className="px-6 py-4">
      <ol className="flex items-center">
        {STAGES.map((stage, i) => {
          const done = i < progress;
          const current = i === progress;
          return (
            <li key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors duration-[360ms]',
                    done ? 'border-accent bg-accent text-accent-fg' : current ? 'border-accent text-accent' : 'border-line-strong text-fg-3',
                  )}
                >
                  {done ? <CheckIcon className="size-4" /> : i + 1}
                </span>
                <span className={cx('text-[13px] font-[650] whitespace-nowrap', done ? 'text-fg' : current ? 'text-accent' : 'text-fg-3')}>
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <span className={cx('mx-4 h-px flex-1', i < progress - 1 ? 'bg-accent' : 'bg-line')} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// --- Timeline --------------------------------------------------------------------------

type TimelineQuote = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

const SHOWN = new Set(['quote.drafted', 'quote.redrafted', 'quote.approved', 'invoice.sent', 'invoice.paid', 'invoice.failed', 'invoice.cancelled', 'job.completed']);

function eventTone(a: Activity): 'done' | 'money' | 'agent' | 'problem' {
  if (a.type === 'invoice.paid') return 'money';
  if (a.type === 'invoice.failed' || a.type === 'invoice.cancelled' || a.type === 'reminder.failed') return 'problem';
  if (a.actor === 'agent') return 'agent';
  return 'done';
}

function Timeline({ quote, activities, recentSince }: { quote: TimelineQuote; activities: Activity[]; recentSince: number }) {
  const events = activities.filter((a) => SHOWN.has(a.type) || a.type.startsWith('reminder.'));
  const deposit = quote.invoices.find((i) => i.kind === 'deposit');
  const balance = quote.invoices.find((i) => i.kind === 'balance');

  // Milestones not reached yet, shown as muted placeholders (never with made-up times).
  const upcoming = [
    !quote.approvedAt && 'Quote approved',
    !deposit?.sentAt && 'Deposit invoice sent',
    deposit?.status !== 'paid' && 'Deposit received',
    !quote.completedAt && 'Job completed',
    !balance?.sentAt && 'Balance invoice sent',
    balance?.status !== 'paid' && 'Final payment',
  ].filter((x): x is string => Boolean(x));

  return (
    <Card className="p-5">
      <CardTitle>Activity</CardTitle>
      <ol className="mt-4">
        {events.map((a, i) => {
          const tone = eventTone(a);
          const meta = a.meta ? (JSON.parse(a.meta) as { paypalInvoiceId?: string }) : {};
          const last = i === events.length - 1 && upcoming.length === 0;
          return (
            <li key={a.id} className="relative flex gap-4 pb-5">
              {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line" aria-hidden />}
              <span
                className={cx(
                  'relative flex size-7 shrink-0 items-center justify-center rounded-full',
                  // A payment confirmed in the last two minutes checks in once when the page refreshes.
                  tone === 'money' && a.at.getTime() > recentSince && 'animate-node-check',
                  tone === 'money' && 'bg-accent text-accent-fg',
                  tone === 'done' && 'bg-surface-3 text-fg',
                  tone === 'agent' && 'bg-state-sent/15 text-state-sent',
                  tone === 'problem' && 'bg-danger/15 text-danger',
                )}
              >
                {tone === 'money' ? (
                  <CheckIcon className="size-4" />
                ) : tone === 'problem' ? (
                  <AlertIcon className="size-4" />
                ) : tone === 'agent' ? (
                  a.type === 'reminder.skipped' ? <SkipIcon className="size-3.5" /> : <MailIcon className="size-4" />
                ) : (
                  <CheckIcon className="size-4" />
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className={cx('font-[650]', tone === 'money' ? 'text-accent' : 'text-fg')}>{a.message}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-fg-3">
                  <span>{formatDateTime(a.at)}</span>
                  <span>{a.actor === 'paypal' ? 'PayPal' : a.actor === 'agent' ? 'Nudge agent' : a.actor === 'system' ? 'Quotely' : 'Operator'}</span>
                  {meta.paypalInvoiceId && <span>{meta.paypalInvoiceId}</span>}
                </div>
              </div>
            </li>
          );
        })}
        {upcoming.map((label, i) => (
          <li key={label} className="relative flex gap-4 pb-5 last:pb-0">
            {i < upcoming.length - 1 && <span className="absolute top-8 bottom-0 left-[13px] w-px border-l border-dashed border-line" aria-hidden />}
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-fg-3">
              <ClockIcon className="size-3.5" />
            </span>
            <div className="pt-1 text-fg-3">{label}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// --- Line items --------------------------------------------------------------------------

function LineItems({ lines, totalCents }: { lines: TimelineQuote['lines']; totalCents: number }) {
  return (
    <Card className="p-5">
      <CardTitle>Quote</CardTitle>
      <table className="mt-3 w-full text-left text-[13px]">
        <thead className="text-[12px] text-fg-3">
          <tr className="h-9">
            <th className="font-[650]">Item</th>
            <th className="text-right font-[650]">Qty</th>
            <th className="text-right font-[650]">Unit price</th>
            <th className="text-right font-[650]">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="h-11 border-t border-line">
              <td className="text-fg">{l.description}</td>
              <td className="text-right font-mono text-fg-2">{l.quantity}</td>
              <td className="text-right font-mono text-fg-2">{l.unitPriceCents === null ? '—' : formatMoney(l.unitPriceCents)}</td>
              <td className="text-right font-mono text-fg">{l.unitPriceCents === null ? '—' : formatMoney(l.unitPriceCents * l.quantity)}</td>
            </tr>
          ))}
          <tr className="h-11 border-t border-line-strong">
            <td colSpan={3} className="text-right text-[12px] font-[650] text-fg-3">
              Total
            </td>
            <td className="text-right font-mono font-semibold text-fg">{formatMoney(totalCents)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

// --- Right rail --------------------------------------------------------------------------

function PaymentBreakdown({
  deposit,
  balance,
  depositCents,
  balanceCents,
}: {
  deposit?: Invoice;
  balance?: Invoice;
  depositCents: number;
  balanceCents: number;
}) {
  const depositPaid = deposit?.status === 'paid';
  const balancePaid = balance?.status === 'paid';
  const rows = [
    { label: depositPaid ? 'Deposit secured' : 'Deposit', cents: depositCents, paid: depositPaid },
    { label: balancePaid ? 'Balance received' : 'Remaining balance', cents: balanceCents, paid: balancePaid },
  ];
  const collected = rows.reduce((s, r) => s + (r.paid ? r.cents : 0), 0);
  const total = depositCents + balanceCents;
  return (
    <Card className="p-5">
      <CardTitle>Payment breakdown</CardTitle>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[650ms] ease-[var(--ease-payment)]" style={{ width: `${total ? (collected / total) * 100 : 0}%` }} />
      </div>
      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-fg-2">
              <span className={cx('size-2 rounded-full', r.paid ? 'bg-accent' : 'bg-surface-3')} aria-hidden />
              {r.label}
            </dt>
            <dd className={cx('font-mono font-medium', r.paid ? 'text-accent' : 'text-fg')}>{formatMoney(r.cents)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <dt className="text-[12px] font-[650] text-fg-3">Collected</dt>
          <dd className="font-mono font-semibold text-fg">
            {formatMoney(collected)} <span className="text-fg-3">/ {formatMoney(total)}</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const INVOICE_STATUS: Record<Invoice['status'], { label: string; tone: string }> = {
  creating: { label: 'Not sent', tone: 'text-danger' },
  draft: { label: 'Not sent', tone: 'text-danger' },
  failed: { label: 'Not sent', tone: 'text-danger' },
  sent: { label: 'Sent · awaiting payment', tone: 'text-state-deposit-due' },
  paid: { label: 'Paid · verified by PayPal', tone: 'text-accent' },
  cancelled: { label: 'Cancelled in PayPal', tone: 'text-fg-3' },
};

function Invoices({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card className="p-5">
      <CardTitle>Invoices</CardTitle>
      {invoices.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-3">No invoices yet. The deposit invoice is created when the quote is approved.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-[650] text-fg">{i.kind === 'deposit' ? 'Deposit invoice' : 'Balance invoice'}</span>
                <span className="font-mono text-fg">{formatMoney(i.amountCents)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</span>
                <span className="font-mono text-fg-3">due {formatDate(i.dueDate)}</span>
              </div>
              <div className="font-mono text-[11px] text-fg-3">
                {i.number}
                {i.paypalInvoiceId && ` · ${i.paypalInvoiceId}`}
              </div>
              {i.paypalInvoiceId && (
                <div className="mt-1 flex gap-4 text-[12px] font-[650]">
                  <a href={merchantUrl(i.paypalInvoiceId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
                    Open in PayPal <ExternalIcon className="size-3.5" />
                  </a>
                  {i.payerViewUrl && i.status === 'sent' && (
                    <a href={i.payerViewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
                      Customer’s payment page <ExternalIcon className="size-3.5" />
                    </a>
                  )}
                </div>
              )}
              {i.seeded && <span className="text-[11px] text-fg-3">Demo invoice, not in PayPal</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const OUTCOME: Record<Reminder['outcome'], { label: string; tone: string }> = {
  sent: { label: 'Sent', tone: 'text-state-sent' },
  scheduled: { label: 'Scheduled', tone: 'text-state-deposit-due' },
  skipped: { label: 'Skipped', tone: 'text-fg-3' },
  failed: { label: 'Failed', tone: 'text-danger' },
};

function Reminders({ reminders }: { reminders: Reminder[] }) {
  return (
    <Card className="p-5">
      <CardTitle aside={<SparkIcon className="size-4 text-fg-3" />}>Reminder activity</CardTitle>
      {reminders.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-3">No reminders yet. The agent will act when a payment is due.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {reminders.map((r) => (
            <li key={r.id} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-fg">{r.rule === 'deposit_unpaid' ? 'Deposit reminder' : 'Overdue balance reminder'}</span>
                <span className={cx('text-[12px] font-[650]', OUTCOME[r.outcome].tone)}>{OUTCOME[r.outcome].label}</span>
              </div>
              <div className="font-mono text-[11px] text-fg-3">
                {r.outcome === 'scheduled' && r.scheduledFor ? `for ${formatDateTime(r.scheduledFor)}` : formatDateTime(r.createdAt)}
                {r.reason ? ` · ${r.reason}` : ''}
              </div>
              {r.message && (
                <details className="group mt-1.5">
                  <summary className="cursor-pointer text-[12px] font-[650] text-fg-2 hover:text-fg">Show message</summary>
                  <div className="mt-2 rounded-control border border-line bg-surface-2 p-3">
                    {r.subject && <div className="mb-2 font-[650] text-fg">{r.subject}</div>}
                    <p className="text-[12px] leading-[19px] whitespace-pre-wrap text-fg-2">{r.message}</p>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-fg-3">Reminders are drafted by AI and logged here. Quotely v1 does not email them.</p>
    </Card>
  );
}
