'use client';

import type { AgWidgetParams } from 'ag-studio';
import { formatMoneyShort } from '@/lib/money';
import { WIDGET_BODY, WidgetEmpty, useWidget } from './shared';

// Money-flow funnel, in a fixed order: Approved quotes -> Deposits received -> Fully paid.
// Bars start at the left edge and their length is each step's share of the approved cohort, so
// the drop-off reads straight down the left side. (Exempt from the design's 3-series limit.)

const COLORS = ['#8FAEFF', '#69DBBE', '#C5FA82'];
const BAR = 22;
const GAP = 14;

export function MoneyFunnel(params: AgWidgetParams) {
  const snapshot = useWidget(params);
  if (!snapshot) return null;
  const steps = snapshot.data.funnel;
  const cohort = steps[0]?.count ?? 0;
  if (cohort === 0) return <WidgetEmpty>Approve your first quote to start tracking conversion.</WidgetEmpty>;

  const shares = steps.map((s) => s.count / cohort);
  // Lengths in a 100-wide viewBox; a step with nothing in it still shows a sliver.
  const widths = shares.map((share) => Math.max(share * 100, 1.5));

  return (
    <div className={`flex flex-col justify-center ${WIDGET_BODY}`}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ marginTop: i === 0 ? 0 : GAP }}>
          <div className="mb-1 flex items-baseline gap-2 text-[12px]">
            <span className="font-[650] text-fg">{step.label}</span>
            <span className="font-mono text-fg-3">
              {step.count} · {formatMoneyShort(step.amountCents)}
            </span>
            <span className="ml-auto font-mono text-[13px] font-semibold" style={{ color: COLORS[i] }}>
              {Math.round(shares[i] * 100)}%
            </span>
          </div>
          <svg viewBox={`0 0 100 ${BAR}`} preserveAspectRatio="none" className="block w-full" style={{ height: BAR }} aria-hidden>
            <rect x="0" y="0" width="100" height={BAR} rx="0" fill="#172426" />
            <rect
              x="0"
              y="0"
              width={widths[i]}
              height={BAR}
              fill={COLORS[i]}
              style={{ transition: 'width 650ms cubic-bezier(.16,1,.3,1)' }}
            />
          </svg>
        </div>
      ))}
      <p className="sr-only">
        {steps.map((s, i) => `${s.label}: ${s.count} (${Math.round(shares[i] * 100)}%)`).join('. ')}
      </p>
    </div>
  );
}
