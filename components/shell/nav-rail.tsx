'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { DashboardIcon, InboxIcon, QuotesIcon, SettingsIcon } from '../icons';
import { LogoMark } from '../logo';
import { cx } from '../ui';

// The 72px icon rail: Dashboard, Inbox, Quotes at the top; Settings and the operator at the bottom.
// The active item gets a 44px lime-tinted tile and a 3px lime bar on the rail's edge.

type Item = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const MAIN: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { href: '/inbox', label: 'Inbox', icon: InboxIcon },
  { href: '/quotes', label: 'Quotes', icon: QuotesIcon },
];
const SETTINGS: Item = { href: '/settings', label: 'Settings', icon: SettingsIcon };

function RailLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className="group relative flex h-11 w-full items-center justify-center"
    >
      {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-accent" aria-hidden />}
      <span
        className={cx(
          'flex size-11 items-center justify-center rounded-control transition-colors duration-[120ms] ease-out',
          active ? 'bg-accent-subtle text-accent' : 'text-fg-3 group-hover:bg-surface-3 group-hover:text-fg',
        )}
      >
        <Icon className="size-[22px]" />
      </span>
      {/* Tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[60px] z-50 rounded-badge border border-line bg-surface-2 px-2 py-1 text-[12px] font-[650] whitespace-nowrap text-fg opacity-0 shadow-menu transition-opacity duration-[120ms] group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {item.label}
      </span>
    </Link>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Main" className="flex w-[72px] shrink-0 flex-col items-center border-r border-line bg-shell py-3">
      <Link href="/dashboard" aria-label="quotely home" className="mb-5 flex h-11 items-center">
        <LogoMark className="size-9" />
      </Link>
      <div className="flex w-full flex-col gap-2">
        {MAIN.map((item) => (
          <RailLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-3">
        <RailLink item={SETTINGS} active={isActive(SETTINGS.href)} />
        <span
          title="Operator · Northstar Rentals"
          className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-[12px] font-bold text-fg-2"
        >
          NR
        </span>
      </div>
    </nav>
  );
}
