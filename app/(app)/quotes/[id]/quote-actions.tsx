'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { InvoiceStatus, QuoteState } from '@prisma/client';
import { Dialog } from '@/components/dialog';
import { AlertIcon, CheckIcon, ClockIcon, ExternalIcon } from '@/components/icons';
import { Button, Card, cx } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { completeJobAction, retryInvoiceAction } from '../../payment-actions';

// The one primary action for the quote's current state (docs/design-system.md, Quote detail).

type InvoiceSummary = { status: InvoiceStatus; amountCents: number; dueDate: string; payerViewUrl: string | null; lastError: string | null };

type Props = {
  quote: {
    id: string;
    state: QuoteState;
    seeded: boolean;
    customer: string;
    email: string;
    depositCents: number;
    balanceCents: number;
    depositPercent: number;
    completed: boolean;
    paidAt: string | null;
    defaultBalanceDue: string;
    today: string;
    lateDays: number;
    nextReminder: string | null;
  };
  deposit: InvoiceSummary | null;
  balance: InvoiceSummary | null;
};

const notSent = (i: InvoiceSummary | null) => !i || i.status === 'creating' || i.status === 'draft' || i.status === 'failed';

export function QuoteActions({ quote, deposit, balance }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'retry' | 'complete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dueDate, setDueDate] = useState(quote.defaultBalanceDue);
  const [justSent, setJustSent] = useState<string | null>(null);

  const retry = async (kind: 'deposit' | 'balance') => {
    setBusy('retry');
    setError(null);
    const result = await retryInvoiceAction(quote.id, kind);
    setBusy(null);
    if (result.ok) setJustSent(`${kind === 'deposit' ? 'Deposit' : 'Balance'} invoice sent · ${formatMoney(result.data.amountCents)} requested`);
    else setError(result.error);
    router.refresh();
  };

  const complete = async () => {
    setBusy('complete');
    setError(null);
    const result = await completeJobAction(quote.id, dueDate);
    setBusy(null);
    setConfirming(false);
    if (result.ok) setJustSent(`Balance invoice sent · ${formatMoney(result.data.amountCents)} requested`);
    else setError(result.error);
    router.refresh();
  };

  // Retry panel: an invoice that should exist was not sent.
  const failedKind =
    quote.state === 'approved' && notSent(deposit)
      ? 'deposit'
      : (quote.state === 'deposit_paid' || quote.state === 'in_progress') && quote.completed && notSent(balance)
        ? 'balance'
        : null;

  if (failedKind && !quote.seeded) {
    return (
      <Panel tone="danger">
        <div className="flex items-start gap-3">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="flex-1">
            <div className="font-[650] text-fg">PayPal couldn’t send this invoice. No payment was requested.</div>
            <p className="mt-1 text-[13px] text-fg-2">
              Retrying checks PayPal first and sends the same {failedKind} invoice; it never creates a second one.
            </p>
            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
          </div>
          <Button variant="primary" onClick={() => retry(failedKind)} disabled={busy !== null}>
            {busy === 'retry' ? 'Checking invoice status…' : 'Retry sending'}
          </Button>
        </div>
      </Panel>
    );
  }

  const sentNote = justSent && (
    <div className="mt-3 flex items-center gap-2 text-[13px] font-[650] text-accent">
      <CheckIcon className="size-4" /> {justSent}
    </div>
  );

  switch (quote.state) {
    case 'approved':
    case 'deposit_due':
      return (
        <Panel tone={quote.lateDays > 0 ? 'warning' : 'neutral'}>
          <Waiting
            title={`Waiting for ${formatMoney(deposit?.amountCents ?? quote.depositCents)} deposit`}
            detail={
              deposit
                ? `${quote.lateDays > 0 ? `Overdue by ${quote.lateDays} ${quote.lateDays === 1 ? 'day' : 'days'} · was ` : ''}due ${formatDate(deposit.dueDate)} · sent to ${quote.email}`
                : 'Deposit invoice not created yet'
            }
            link={deposit?.payerViewUrl}
            reminder={quote.nextReminder}
          />
          {sentNote}
        </Panel>
      );
    case 'deposit_paid':
    case 'in_progress':
      return (
        <Panel tone="success">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-[650] text-accent">
                <CheckIcon className="size-5" /> {formatMoney(deposit?.amountCents ?? quote.depositCents)} received. Deposit secured.
              </div>
              <p className="mt-1 text-[13px] text-fg-2">When the job is done, send the balance of {formatMoney(quote.balanceCents)}.</p>
            </div>
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={quote.seeded || busy !== null} title={quote.seeded ? 'Demo data is not connected to PayPal' : undefined}>
              Mark job complete & send balance invoice
            </Button>
          </div>
          {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
          {quote.seeded && <p className="mt-3 text-[12px] text-fg-3">Demo quote: invoicing is disabled. Draft a quote from a request to try the live flow.</p>}
          <Dialog
            open={confirming}
            onClose={() => setConfirming(false)}
            title="Send the balance invoice?"
            dismissible={busy === null}
            footer={
              <>
                <Button onClick={() => setConfirming(false)} disabled={busy !== null}>
                  Not yet
                </Button>
                <Button variant="primary" onClick={complete} disabled={busy !== null || !dueDate || dueDate < quote.today}>
                  {busy === 'complete' ? 'Sending invoice…' : 'Create & send PayPal invoice'}
                </Button>
              </>
            }
          >
            <p className="text-fg-2">This marks the job complete and requests the remaining balance through PayPal.</p>
            <dl className="mt-4 flex flex-col gap-2 text-[13px]">
              <Row label="Customer" value={quote.customer} />
              <Row label="Email" value={quote.email} />
              <Row label="Balance" value={`${formatMoney(quote.balanceCents)} (${100 - quote.depositPercent}%)`} strong />
            </dl>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[12px] font-[650] text-fg-3">Due date</span>
              <input
                type="date"
                value={dueDate}
                min={quote.today}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 rounded-control border border-line bg-surface-2 px-3 font-mono text-[13px] text-fg [color-scheme:dark] focus:border-focus focus:outline-none"
              />
            </label>
          </Dialog>
        </Panel>
      );
    case 'balance_due':
      return (
        <Panel tone={quote.lateDays > 0 ? 'warning' : 'neutral'}>
          <Waiting
            title={`Waiting for ${formatMoney(balance?.amountCents ?? quote.balanceCents)} balance`}
            detail={
              balance
                ? `${quote.lateDays > 0 ? `Overdue by ${quote.lateDays} ${quote.lateDays === 1 ? 'day' : 'days'} · was ` : ''}due ${formatDate(balance.dueDate)} · sent to ${quote.email}`
                : ''
            }
            link={balance?.payerViewUrl}
            reminder={quote.nextReminder}
          />
          {sentNote}
        </Panel>
      );
    case 'paid':
      return (
        <Panel tone="success">
          <div className="flex items-center gap-2 font-[650] text-accent">
            <CheckIcon className="size-5" /> All paid. This job is settled.
          </div>
          <p className="mt-1 text-[13px] text-fg-2">
            Job fully paid{quote.paidAt ? ` on ${formatDate(quote.paidAt)}` : ''} · {formatMoney(quote.depositCents + quote.balanceCents)} collected.
          </p>
        </Panel>
      );
    default:
      return null;
  }
}

function Panel({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <Card
      className={cx(
        'p-5',
        tone === 'success' && 'border-accent/30 bg-accent-subtle/40',
        tone === 'warning' && 'border-state-overdue/40',
        tone === 'danger' && 'border-danger/50 bg-danger/5',
      )}
    >
      {children}
    </Card>
  );
}

function Waiting({ title, detail, link, reminder }: { title: string; detail: string; link?: string | null; reminder?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <ClockIcon className="mt-0.5 size-5 shrink-0 text-state-deposit-due" />
        <div>
          <div className="font-[650] text-fg">{title}</div>
          {detail && <p className="mt-0.5 text-[13px] text-fg-2">{detail}</p>}
          {reminder && <p className="mt-1 text-[12px] font-[650] text-state-sent">{reminder}</p>}
        </div>
      </div>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-[650] text-fg-2 hover:text-fg">
          Customer’s payment page <ExternalIcon className="size-4" />
        </a>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-3">{label}</dt>
      <dd className={cx('text-right', strong ? 'font-mono font-semibold text-fg' : 'text-fg')}>{value}</dd>
    </div>
  );
}
