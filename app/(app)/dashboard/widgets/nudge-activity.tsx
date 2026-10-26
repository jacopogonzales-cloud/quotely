'use client';

import type { AgWidgetParams } from 'ag-studio';
import { AlertIcon, ClockIcon, MailIcon, SkipIcon } from '@/components/icons';
import { cx } from '@/components/ui';
import { formatDay, formatRelative } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { WIDGET_BODY, WidgetEmpty, useWidget } from './shared';

// The nudge agent's latest four actions: outcome, what, who, how much, why and when.

const OUTCOME = {
  sent: { icon: MailIcon, label: 'sent', tone: 'bg-state-sent/15 text-state-sent', text: 'text-state-sent' },
  scheduled: { icon: ClockIcon, label: 'scheduled', tone: 'bg-state-deposit-due/15 text-state-deposit-due', text: 'text-state-deposit-due' },
  skipped: { icon: SkipIcon, label: 'skipped', tone: 'bg-surface-3 text-fg-3', text: 'text-fg-3' },
  failed: { icon: AlertIcon, label: 'failed', tone: 'bg-danger/15 text-danger', text: 'text-danger' },
} as const;

export function NudgeActivity(params: AgWidgetParams) {
  const snapshot = useWidget(params);
  if (!snapshot) return null;
  const { data, navigate } = snapshot;
  if (data.nudges.length === 0) {
    return <WidgetEmpty>No agent activity yet. Reminders will appear here when payments need attention.</WidgetEmpty>;
  }

  return (
    <ul className={`flex flex-col gap-1 overflow-y-auto ${WIDGET_BODY}`}>
      {data.nudges.map((n) => {
        const o = OUTCOME[n.outcome];
        const Icon = o.icon;
        const what = n.rule === 'deposit_unpaid' ? 'Deposit reminder' : 'Balance reminder';
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => navigate(`/quotes/${n.quoteId}`)}
              className="flex w-full items-start gap-3 rounded-control px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-3"
            >
              <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full', o.tone)}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-[650] text-fg">{what}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-3">
                    {n.outcome === 'scheduled' && n.scheduledFor ? `for ${formatDay(n.scheduledFor)}` : formatRelative(n.at)}
                  </span>
                </span>
                <span className="block truncate text-[12px] text-fg-2">
                  <span className={cx('font-[650] capitalize', o.text)}>{o.label}</span> · {n.customer} ·{' '}
                  <span className="font-mono">{formatMoney(n.amountCents)}</span>
                </span>
                {n.reason && <span className="block truncate text-[11px] text-fg-3">{n.reason}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
