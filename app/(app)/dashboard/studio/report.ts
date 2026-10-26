// The "Cash Flow" report, page "Overview": the dashboard as AG Studio state, laid out per
// docs/design-system.md (24-track grid). It is what the page opens with, so it is never empty.
// Field ids refer to ./data.ts; the three custom widget types are defined in ./widgets.tsx.

import type { AgPageState, AgReportState, AgWidgetLayoutState } from 'ag-studio';
import { MANROPE, PLEX_MONO } from './theme';
import { hasCashMovementWidget, type QuotelyRegistry } from './widgets';

/** Bump when the layout changes, so a customised layout saved in this browser is replaced. */
export const REPORT_VERSION = 'cash-flow-v2';

// Canvas rows are 16px (studioCanvasRowHeight), so heights in the design doc divide by 16:
// 128px = 8 rows, 272px = 17 rows, 320px = 20 rows.
const ROW = 16;
const at = (xTrack: number, yTrack: number, xSpan: number, heightPx: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan: heightPx / ROW,
});

/** Rounds a pixel height up to whole canvas rows. */
const rows = (px: number) => Math.ceil(px / ROW) * ROW;

// Content heights of the list widgets, in px, including the 16px the canvas keeps around each
// widget (layout.widgetPadding). Measured from the rendered widgets; they size the rows to their
// content so the canvas has no dead space.
const SCOREBOARD_PX = (n: number) => (n === 0 ? 192 : 136 + 48 * n); // titles, rows, footer link
const NUDGES_PX = (n: number, withReason: number) => (n === 0 ? 192 : 60 + 52 * n + 14 * withReason);
const LEDGER_PX = (n: number) => (n === 0 ? 192 : 64 + 44 * (n + 2)); // title, header, rows, total

export type ReportCounts = { debtors: number; receivables: number; nudges: number; nudgesWithReason: number };

const title = (text: string, subtitle?: string) => ({
  title: { enabled: true, text },
  ...(subtitle && { subtitle: { enabled: true, text: subtitle } }),
});

// KPI tile: title, the figure in IBM Plex Mono, and a caption saying whether it is a stock
// ("As of now") or a flow ("This month").
const kpi = (text: string, measure: string, caption: string, color: string, fontSize = 24) => ({
  type: 'value' as const,
  dataMapping: { value: [{ id: measure }] },
  format: {
    title: { enabled: true, text, typography: { fontFamily: MANROPE, fontSize: 12, fontWeight: 'bold' as const }, color: '#B8C8C6' },
    caption: { enabled: true, text: caption, typography: { fontFamily: MANROPE, fontSize: 11 }, color: '#819593' },
    style: {
      typography: { fontFamily: PLEX_MONO, fontSize, fontWeight: 'bold' as const },
      color,
      textAlign: 'left' as const,
      verticalAlign: 'center' as const,
      textScaling: { enabled: false },
    },
  },
});

function overviewPage(c: ReportCounts): AgPageState<QuotelyRegistry> {
  // Row 3 holds the scoreboard (at most 5 debtors) and the nudge feed side by side; row 4 the
  // ledger and the donut, which needs about 288px to stay readable.
  const row3 = Math.max(rows(SCOREBOARD_PX(Math.min(c.debtors, 5))), rows(NUDGES_PX(c.nudges, c.nudgesWithReason)));
  // Beyond 8 receivables the grid scrolls instead of growing.
  const row4 = Math.max(rows(LEDGER_PX(Math.min(c.receivables, 8))), 288);
  const y3 = 8 + 17;
  const y4 = y3 + row3 / ROW;
  return {
    id: 'overview',
    widgets: {
      'kpi-outstanding': kpi('Outstanding now', 'outstanding', 'As of now', '#F3F7F4'),
      'kpi-overdue': kpi('Overdue now', 'overdue', 'As of now', '#FF8C91'),
      'kpi-deposits': kpi('Deposits secured', 'depositsSecured', 'This month', '#69DBBE'),
      // Most emphasis: the money that actually arrived.
      'kpi-collected': kpi('Collected this month', 'collected', 'This month', '#C5FA82', 28),

      'cash-movement': {
        // The pre-configured line chart with a denser y-axis (./widgets.tsx), when available.
        type: hasCashMovementWidget ? 'quotely-cash-movement' : 'line-chart',
        dataMapping: {
          categoryKey: [{ id: 'cashWeeks.weekStart' }],
          // Series order picks the palette colours: teal, lime, blue (see ./theme.ts).
          valueKey: [{ id: 'depositsReceived' }, { id: 'balancesReceived' }, { id: 'expectedDue' }],
        },
        sort: [{ field: { id: 'cashWeeks.weekStart' }, direction: 'asc' }],
        format: {
          ...title('Cash movement', 'Weekly · received vs falling due'),
          style: {
            theme: {
              common: { legend: { enabled: true, position: 'bottom' } },
              line: { series: { marker: { enabled: true, size: 6 }, interpolation: { type: 'linear' } } },
            },
            custom: {
              categoryAxisMode: 'categorical',
            },
          },
        },
      },

      funnel: {
        type: 'quotely-money-funnel',
        dataMapping: {},
        format: title('Money flow', 'Share of approved quotes'),
      },
      debtors: {
        type: 'quotely-debtor-scoreboard',
        dataMapping: {},
        format: title('Who owes what', 'Overdue first, then nearest due'),
      },
      nudges: {
        type: 'quotely-nudge-activity',
        dataMapping: {},
        format: title('Nudge agent activity'),
      },

      ledger: {
        type: 'grid',
        dataMapping: {
          cols: [
            { id: 'customers.company' },
            { id: 'receivables.invoice' },
            { id: 'receivables.stage' },
            { id: 'owed' },
            { id: 'receivables.dueDate' },
            { id: 'receivables.reminderStatus' },
          ],
        },
        sort: [{ field: { id: 'receivables.dueDate' }, direction: 'asc' }],
        format: { ...title('Receivables ledger'), style: { columnAutoSize: true, grandTotalRow: { enabled: true } } },
      },
      composition: {
        type: 'donut-chart',
        dataMapping: {
          categoryKey: [{ id: 'payments.kind' }],
          valueKey: [{ id: 'collected' }],
        },
        // "Deposits" first, so it takes the first palette colour (teal), balances the second (lime).
        sort: [{ field: { id: 'payments.kind' }, direction: 'desc' }],
        format: {
          ...title('Payment composition', 'This month'),
          style: {
            theme: { common: { legend: { enabled: true, position: 'bottom' } } },
            custom: { totalLabel: { enabled: true, fontFamily: PLEX_MONO, fontSize: 14, fontWeight: 'bold', color: '#F3F7F4' }, pieDataLabel: { enabled: false } },
          },
        },
      },
    },
    // The filters panel (opened by the header's Filters button): customer (all widgets) and invoice type.
    filter: { page: [{ field: { id: 'customers.company' } }, { field: { id: 'receivables.kind' } }] },
    widgetLayout: {
      'kpi-outstanding': at(0, 0, 6, 128),
      'kpi-overdue': at(6, 0, 6, 128),
      'kpi-deposits': at(12, 0, 6, 128),
      'kpi-collected': at(18, 0, 6, 128),
      'cash-movement': at(0, 8, 14, 272),
      funnel: at(14, 8, 10, 272),
      debtors: at(0, y3, 16, row3),
      nudges: at(16, y3, 8, row3),
      ledger: at(0, y4, 16, row4),
      composition: at(16, y4, 8, row4),
    },
  };
}

/** The built-in report, with list widgets sized to the data they hold right now. */
export function cashFlowReport(counts: ReportCounts): AgReportState<QuotelyRegistry> {
  return { selectedPageId: 'overview', pages: [overviewPage(counts)] };
}
