import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { QuoteState } from '@prisma/client';
import { STATE_LABEL } from '@/lib/quote-state';
import { AlertIcon } from './icons';

// Shared building blocks, styled with the tokens in app/globals.css. Server-safe: no hooks.

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// --- Buttons -------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-out disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
  ghost: 'text-fg-2 hover:bg-surface-3 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};
const BUTTON_SIZE: Record<Size, string> = {
  md: 'h-11 px-4 text-[14px]',
  sm: 'h-9 px-3 text-[13px]',
};

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className?: string) =>
  cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// --- Surfaces ------------------------------------------------------------------------

export function Card({ className, children, ...props }: ComponentProps<'section'>) {
  return (
    <section className={cx('rounded-card border border-line bg-surface-1', className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[16px] leading-6 font-bold text-fg">{children}</h3>
      {aside}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[12px] leading-[18px] font-[650] text-fg-3', className)}>{children}</div>;
}

// --- Pills ---------------------------------------------------------------------------

const STATE_PILL: Record<QuoteState, string> = {
  draft: 'bg-state-draft/15 text-state-draft',
  approved: 'bg-state-sent/15 text-state-sent',
  deposit_due: 'bg-state-deposit-due/15 text-state-deposit-due',
  deposit_paid: 'bg-state-deposit-paid/15 text-state-deposit-paid',
  in_progress: 'bg-state-in-progress/15 text-state-in-progress',
  balance_due: 'bg-state-balance-due/15 text-state-balance-due',
  paid: 'bg-state-paid/15 text-state-paid',
};

// Colour changes (e.g. Deposit due -> Deposit paid after a payment) ease over 360ms.
const PILL = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-none font-[650] whitespace-nowrap transition-colors duration-[360ms]';

/** A quote's stage: always text plus colour, never colour alone. */
export function StatePill({ state }: { state: QuoteState }) {
  return (
    <span className={cx(PILL, STATE_PILL[state])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

/** The overdue modifier, shown next to the stage pill. */
export function OverduePill({ days }: { days?: number }) {
  return (
    <span className={cx(PILL, 'bg-state-overdue/15 text-state-overdue')}>
      <AlertIcon className="size-3.5" />
      Overdue{days ? ` · ${days}d` : ''}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-badge border border-line bg-surface-2 px-2 text-[11px] leading-4 font-[550] text-fg-2', className)}>
      {children}
    </span>
  );
}

// --- States --------------------------------------------------------------------------

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-card bg-surface-2 text-fg-2">{icon}</div>}
      <h2 className="text-[20px] leading-7 font-bold text-fg">{title}</h2>
      {body && <p className="max-w-sm text-fg-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-control bg-surface-2', className)} aria-hidden />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-6 px-6 py-4">
      <div>
        <h1 className="text-[26px] leading-[34px] font-[750] tracking-[-0.01em] text-fg">{title}</h1>
        {subtitle && <p className="text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

export { cx };
