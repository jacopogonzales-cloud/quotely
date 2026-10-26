'use client';

import { useEffect, useRef, useState } from 'react';
import type { InvoiceKind } from '@prisma/client';
import { formatMoney } from '@/lib/money';
import { CheckIcon, CloseIcon } from './icons';

// "Payment received": shown only for payments PayPal has confirmed (the same backend event that
// moves the quote). Motion per docs/design-system.md: slides up 12px and fades in (0-180ms), the
// amount counts up (120-480ms), a soft lime glow; dismisses after 5s unless hovered. With
// prefers-reduced-motion everything is instant.

export type ToastPayment = { quoteId: string; quoteNumber: string; customer: string; kind: InvoiceKind; amountCents: number };

const DISMISS_MS = 5_000;

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `cents` between 120ms and 480ms after mount (ease-out). */
function useCountUp(cents: number) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? cents : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const start = performance.now() + 120;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 360));
      setValue(Math.round(cents * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents]);
  return value;
}

export function PaymentToast({ payment, onDone }: { payment: ToastPayment; onDone: () => void }) {
  const [hovered, setHovered] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(() => done.current(), DISMISS_MS);
    return () => clearTimeout(t);
  }, [hovered]);
  const amount = useCountUp(payment.amountCents);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="animate-toast-in pointer-events-auto w-[380px] rounded-card border border-accent/40 bg-surface-1 p-4 shadow-menu"
      style={{ backgroundImage: 'radial-gradient(120% 90% at 0% 0%, rgba(197,250,130,0.14), transparent 60%)' }}
    >
      <span className="sr-only">
        Payment received: {formatMoney(payment.amountCents)} from {payment.customer}, {payment.kind}, confirmed by PayPal.
      </span>
      <div className="flex items-start gap-3" aria-hidden>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
          <CheckIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-[0.08em] text-accent">PAYMENT RECEIVED</div>
          <div className="font-mono text-[24px] leading-[30px] font-semibold text-fg">+{formatMoney(amount)}</div>
          <div className="truncate font-[650] text-fg">{payment.customer}</div>
          <div className="text-[12px] text-fg-2">
            {payment.kind === 'deposit' ? 'Deposit secured' : 'Balance paid · job settled'} · Confirmed by PayPal
          </div>
          <div className="text-[12px] text-fg-3">Quote {payment.quoteNumber} updated automatically</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => done.current()}
        aria-label="Dismiss"
        className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-[8px] text-fg-3 hover:bg-surface-3 hover:text-fg"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
