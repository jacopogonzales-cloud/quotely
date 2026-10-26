'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshPaymentsAction, type PaymentUpdate } from '@/app/(app)/payment-actions';
import { PaymentToast } from './payment-toast';
import { AlertIcon } from './icons';

// Keeps an open page in step with PayPal: every 30 seconds (and when the tab becomes visible) it
// reconciles open invoices, and when a payment is recorded (by polling or by the webhook) it
// refreshes the page and announces it. Paid is only ever shown after PayPal confirmed it.

const POLL_MS = 30_000;

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
      // One toast per paid invoice, even if two polls report it.
      if (relevant.length) setToasts((t) => [...t, ...relevant.filter((p) => !t.some((x) => x.quoteId === p.quoteId && x.kind === p.kind))]);
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
            {checking ? 'Checking with PayPal…' : checkedAt ? `Synced with PayPal ${checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Watching for payments'}
            {!compact && !checking && (
              <button type="button" onClick={() => void check(true)} className="font-[650] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
                Refresh
              </button>
            )}
          </>
        )}
      </div>
      {/* Top-right, under the top bar; new payments stack below the first. */}
      <div className="pointer-events-none fixed top-20 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t) => (
          <div key={`${t.quoteId}-${t.kind}`} className="relative">
            <PaymentToast payment={t} onDone={() => setToasts((all) => all.filter((x) => x !== t))} />
          </div>
        ))}
      </div>
    </>
  );
}
