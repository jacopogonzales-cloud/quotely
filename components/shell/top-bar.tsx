'use client';

import { usePathname } from 'next/navigation';
import { Wordmark } from '../logo';

// The 64px top bar: where you are, whether PayPal is connected, and whose books these are.

const CONTEXT: [prefix: string, label: string][] = [
  ['/quotes/new', 'Quotes / New quote'],
  ['/quotes/', 'Quotes / Quote'],
  ['/quotes', 'Quotes & jobs'],
  ['/inbox', 'Inbox'],
  ['/settings', 'Settings'],
  ['/dashboard', 'Dashboard'],
];

export function TopBar({ paypalConfigured }: { paypalConfigured: boolean }) {
  const pathname = usePathname();
  const context = CONTEXT.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? '';

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-shell px-6">
      <Wordmark className="text-[20px]" />
      <span className="h-5 w-px bg-line" aria-hidden />
      <span className="text-[13px] font-[650] text-fg-2">{context}</span>

      <div className="ml-auto flex items-center gap-4">
        <span
          className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-1 px-3 text-[12px] font-[650] text-fg-2"
          title={paypalConfigured ? 'PayPal sandbox credentials are set' : 'Set PAYPAL_CLIENT_ID and PAYPAL_SECRET'}
        >
          <span className={`size-2 rounded-full ${paypalConfigured ? 'bg-state-deposit-paid' : 'bg-danger'}`} aria-hidden />
          {paypalConfigured ? 'PayPal connected' : 'PayPal not connected'}
          <span className="rounded-badge bg-surface-3 px-1.5 py-0.5 text-[11px] font-[550] text-fg-3">Sandbox</span>
        </span>
        <span className="text-[13px] font-[650] text-fg">Northstar Rentals</span>
      </div>
    </header>
  );
}
