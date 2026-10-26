'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { QuoteState } from '@prisma/client';
import { QuotesIcon, SearchIcon } from '@/components/icons';
import { ButtonLink, Card, EmptyState, OverduePill, StatePill, Button, cx } from '@/components/ui';
import { formatMoney } from '@/lib/money';

// The quotes table. Search and tab live in the URL (?q=&tab=), so Back from a quote restores them.

export type QuoteRow = {
  id: string;
  number: string;
  title: string;
  customer: string;
  jobDate: string;
  jobSort: string;
  totalCents: number;
  state: QuoteState;
  daysOverdue: number;
  nextAction: string;
};

const TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'awaiting', label: 'Awaiting payment', match: (s: QuoteState) => s === 'approved' || s === 'deposit_due' || s === 'balance_due' },
  { key: 'completed', label: 'Completed', match: (s: QuoteState) => s === 'paid' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function QuotesTable({ rows }: { rows: QuoteRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get('q') ?? '';
  const tabKey = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'all') as TabKey;

  // Shallow URL updates: no server round trip, but the history entry carries the filters.
  const setParams = (next: { q?: string; tab?: TabKey }) => {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value && !(key === 'tab' && value === 'all')) sp.set(key, value);
      else sp.delete(key);
    }
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };

  const tab = TABS.find((t) => t.key === tabKey)!;
  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      tab.match(r.state) &&
      (!needle || [r.number, r.customer, r.title].some((field) => field.toLowerCase().includes(needle))),
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        className="flex-1"
        icon={<QuotesIcon />}
        title="Your first quote starts with a request."
        action={
          <ButtonLink href="/inbox" variant="primary">
            Go to inbox
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
      <div className="flex items-center justify-between gap-4">
        <div role="tablist" aria-label="Filter quotes" className="flex gap-1 rounded-control border border-line bg-surface-1 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tabKey}
              onClick={() => setParams({ tab: t.key })}
              className={cx(
                'h-9 rounded-[8px] px-3 text-[13px] font-[650] transition-colors duration-[180ms] ease-[var(--ease-fast)]',
                t.key === tabKey ? 'bg-surface-3 text-fg' : 'text-fg-3 hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative w-[320px]">
          <span className="sr-only">Search quotes</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder="Search quote, customer or job"
            className="h-11 w-full rounded-control border border-line bg-surface-2 pr-3 pl-9 text-fg placeholder:text-fg-3 hover:border-line-strong focus:border-focus focus:outline-none"
          />
        </label>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[120px]" />
            <col />
            <col className="w-[130px]" />
            <col className="w-[140px]" />
            <col className="w-[230px]" />
            <col className="w-[260px]" />
          </colgroup>
          <thead className="bg-surface-2 text-[12px] font-[650] text-fg-3">
            <tr className="h-11">
              <th className="px-4 font-[650]">Quote</th>
              <th className="px-4 font-[650]">Customer</th>
              <th className="px-4 font-[650]">Job date</th>
              <th className="px-4 text-right font-[650]">Total</th>
              <th className="px-4 font-[650]">Current state</th>
              <th className="px-4 font-[650]">Next action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/quotes/${r.id}`)}
                className="h-[52px] cursor-pointer border-t border-line transition-colors duration-[120ms] hover:bg-surface-3"
              >
                <td className="px-4">
                  <a
                    href={`/quotes/${r.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/quotes/${r.id}`);
                    }}
                    className="font-mono text-[13px] text-fg"
                  >
                    {r.number}
                  </a>
                </td>
                <td className="truncate px-4">
                  <span className="font-[650] text-fg">{r.customer}</span>
                  <span className="ml-2 text-[13px] text-fg-3">{r.title}</span>
                </td>
                <td className="px-4 font-mono text-[13px] text-fg-2">{r.jobDate}</td>
                <td className="px-4 text-right font-mono text-[13px] font-medium text-fg">{formatMoney(r.totalCents)}</td>
                <td className="px-4">
                  <span className="flex items-center gap-1.5">
                    <StatePill state={r.state} />
                    {r.daysOverdue > 0 && <OverduePill days={r.daysOverdue} />}
                  </span>
                </td>
                <td className="truncate px-4 text-[13px] text-fg-2">{r.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <EmptyState
            title="No quotes match your search."
            action={
              <Button onClick={() => setParams({ q: '', tab: 'all' })}>Clear search</Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
