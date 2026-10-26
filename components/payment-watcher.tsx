'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshPaymentsAction, type PaymentUpdate } from '@/app/(app)/payment-actions';
import { formatMoney } from '@/lib/money';
import { AlertIcon, CheckIcon, CloseIcon } from './icons';

// Keeps an open page in step with PayPal: every 30 seconds (and when the tab becomes visible) it
// reconciles open invoices, and when a payment is recorded (by polling or by the webhook) it
// refreshes the page and announces it. Paid is only ever shown after PayPal confirmed it.

const POLL_MS = 30_000;
const TOAST_MS = 5_000;

export function PaymentWatcher({ quoteId, compact = false }: { quoteId?: string; compact?: boolean }) {
  const router = useRouter();
  const since = useRef(new Date().toISOString());
  const busy = useRef(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [toasts, setToasts] = useState<PaymentUpdate[]>([]);

  const check = useCallback(
    async (manual = false) => {
      if (busy.current) return;
      busy.current = true;
      setChecking(true);
      const result = await refreshPaymentsAction(since.current, manual).catch(() => null);
      busy.current = false;
      setChecking(false);
      if (!result?.ok) {
        setError(result?.error ?? 'Payment status couldn’t be refreshed. Your invoice remains unchanged.');
        return;
      }
      setError(null);
      since.current = result.data.now;
      setCheckedAt(new Date());
      const relevant = result.data.payments.filter((p) => !quoteId || p.quoteId === quoteId);
      if (result.data.payments.length) router.refresh();
      if (relevant.length) setToasts((t) => [...t, ...relevant]);
    },
    [quoteId, router],
  );

  useEffect(() => {
    const first = setTimeout(() => void check(), 1_500);
    const timer = setInterval(() => void check(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return (
    <>
      <div className="flex items-center gap-2 text-[12px] text-fg-3" aria-live="polite">
        {error ? (
          <>
            <AlertIcon className="size-3.5 text-danger" />
            <span className="text-danger">{error}</span>
            <button type="button" onClick={() => void check(true)} className="font-[650] text-fg underline-offset-4 hover:underline">
              Retry
            </button>
          </>
        ) : (
          <>
            <span className={`size-1.5 rounded-full ${checking ? 'animate-pulse bg-state-sent' : 'bg-state-deposit-paid'}`} aria-hidden />
            {checking ? 'Checking with PayPal…' : checkedAt ? `Synced with PayPal ${checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Watching for payments'}
            {!compact && !checking && (
              <button type="button" onClick={() => void check(true)} className="font-[650] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
                Refresh
              </button>
            )}
          </>
        )}
      </div>
      <div className="pointer-events-none fixed top-20 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t, i) => (
          <PaymentToast key={`${t.quoteId}-${t.kind}-${i}`} payment={t} onDone={() => setToasts((all) => all.filter((x) => x !== t))} />
        ))}
      </div>
    </>
  );
}

function PaymentToast({ payment, onDone }: { payment: PaymentUpdate; onDone: () => void }) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(t);
  }, [hovered, onDone]);

  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="pointer-events-auto w-[360px] rounded-card border border-accent/40 bg-surface-1 p-4 shadow-menu"
      style={{ backgroundImage: 'radial-gradient(120% 80% at 0% 0%, rgba(197,250,130,0.12), transparent 60%)' }}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
          <CheckIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-[0.08em] text-accent">PAYMENT RECEIVED</div>
          <div className="font-mono text-[24px] leading-[30px] font-semibold text-fg">+{formatMoney(payment.amountCents)}</div>
          <div className="truncate font-[650] text-fg">{payment.customer}</div>
          <div className="text-[12px] text-fg-2">
            {payment.kind === 'deposit' ? 'Deposit secured' : 'Balance paid · job settled'} · Confirmed by PayPal
          </div>
          <div className="text-[12px] text-fg-3">Quote {payment.quoteNumber} updated automatically</div>
        </div>
        <button type="button" onClick={onDone} aria-label="Dismiss" className="text-fg-3 hover:text-fg">
          <CloseIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
