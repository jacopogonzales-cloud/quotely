'use client';

import type { AgWidgetParams } from 'ag-studio';
import { ChevronRightIcon } from '@/components/icons';
import { OverduePill, StatePill } from '@/components/ui';
import { formatDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { WIDGET_BODY, WidgetEmpty, useWidget } from './shared';

// "Who owes what": the five customers to chase, overdue first, then nearest due, then largest.

const monogram = (company: string) =>
  company
    .replace(/\b(S\.?r\.?l\.?|S\.?p\.?A\.?|Ltd|GmbH)\b/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function DebtorScoreboard(params: AgWidgetParams) {
  const snapshot = useWidget(params);
  if (!snapshot) return null;
  const { data, navigate } = snapshot;
  const rows = data.debtors.slice(0, 5);

  if (rows.length === 0) return <WidgetEmpty>You&rsquo;re all caught up. No outstanding invoices.</WidgetEmpty>;

  return (
    // A container query lets the rows shed detail when the widget is narrow (e.g. edit panels open).
    <div className={`@container flex flex-col ${WIDGET_BODY}`}>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((d) => (
          <li key={d.quoteId}>
            <button
              type="button"
              onClick={() => navigate(`/quotes/${d.quoteId}`)}
              className="group grid h-12 w-full grid-cols-[32px_minmax(96px,1fr)_auto_auto_16px] items-center gap-3 rounded-control px-2 text-left transition-colors duration-[120ms] hover:bg-surface-3 @[560px]:grid-cols-[32px_minmax(96px,1fr)_auto_auto_56px_16px]"
            >
              <span className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-[11px] font-bold text-fg-2">
                {monogram(d.company)}
              </span>
              <span className="min-w-0 overflow-hidden">
                <span className="block truncate font-[650] text-fg">{d.company}</span>
                <span className="block truncate font-mono text-[11px] text-fg-3">{d.quoteNumber}</span>
              </span>
              <span className="text-right font-mono text-[13px] font-medium text-fg">{formatMoney(d.amountCents)}</span>
              <span className="flex items-center justify-end gap-1.5">
                <StatePill state={d.state} />
                {d.daysOverdue > 0 && (
                  <span className="hidden @[560px]:inline-flex">
                    <OverduePill days={d.daysOverdue} />
                  </span>
                )}
              </span>
              <span className={`hidden text-right font-mono text-[12px] @[560px]:block ${d.daysOverdue > 0 ? 'text-state-overdue' : 'text-fg-3'}`}>
                {formatDay(`${d.dueDate}T12:00:00Z`)}
              </span>
              <ChevronRightIcon className="size-4 text-fg-3 transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-fg" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigate('/quotes?tab=awaiting')}
        className="mt-2 flex h-9 items-center justify-center gap-1 border-t border-line pt-2 text-[12px] font-[650] text-fg-2 hover:text-fg"
      >
        View all receivables{data.debtors.length > 5 ? ` (${data.debtors.length})` : ''} <ChevronRightIcon className="size-3.5" />
      </button>
    </div>
  );
}
