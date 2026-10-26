'use client';

// Studio's widget set for the Quotely dashboard: every built-in widget, plus three custom React
// widgets registered with createWidgets(), a pre-configured line chart, and cell renderers for
// the receivables grid.

import type { ComponentType } from 'react';
import { _ALL_WIDGET_DEFS, type AgDefaultWidgetDefinition, type AgFormats, type AgLineChart, type AgWidgetData, type AgWidgetDataFormat, type AgWidgetField } from 'ag-studio';
import type { AgAiToolDisplay, AgRegistry, AgWidgetDefinition } from 'ag-studio-react';
import { createWidgets } from 'ag-studio-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import { DebtorScoreboard } from '../widgets/debtor-scoreboard';
import { MoneyFunnel } from '../widgets/money-funnel';
import { NudgeActivity } from '../widgets/nudge-activity';

export type QuotelyWidgetType = 'quotely-debtor-scoreboard' | 'quotely-money-funnel' | 'quotely-nudge-activity';
type CashMovementState = Omit<AgLineChart, 'type'> & { type: 'quotely-cash-movement' };
type CashMovementDefinition = AgWidgetDefinition<'quotely-cash-movement', CashMovementState>;
// Saved state of a custom widget: its type, titles and an empty data mapping.
type CustomState<T extends QuotelyWidgetType> = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: T };
type DefinitionOf<T extends QuotelyWidgetType> = AgWidgetDefinition<T, CustomState<T>>;
type QuotelyWidgetDefinition = DefinitionOf<'quotely-debtor-scoreboard'> | DefinitionOf<'quotely-money-funnel'> | DefinitionOf<'quotely-nudge-activity'>;

export interface QuotelyRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | QuotelyWidgetDefinition | CashMovementDefinition)[];
  components: Partial<Record<string, never>>;
  aiToolDisplay: AgAiToolDisplay;
  formats: AgFormats;
  buckets: AgRegistry['buckets'];
}

// 24px stroke icons for the widget menu, in the app's icon style.
const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const custom = <T extends QuotelyWidgetType>(
  id: T,
  label: string,
  comp: ComponentType<never>,
  icon: string,
  description: string,
): DefinitionOf<T> => ({
  id,
  label,
  icon: svg(icon),
  comp: comp as DefinitionOf<T>['comp'],
  // No data mapping: these widgets read Quotely's own view models (see ../store.ts), so their
  // form is the standard widget and titles sections.
  form: (params) => params.createDefaults({}),
  defaultState: { dataMapping: {} } as Partial<CustomState<T>>,
  defaultSize: { width: 8, height: 17 },
  minSize: { width: 6, height: 10 },
  ai: { label, description, usage: 'Quotely-specific widget with fixed content; it has no data mapping to configure.' },
});

const QUOTELY_WIDGETS: QuotelyWidgetDefinition[] = [
  custom(
    'quotely-debtor-scoreboard',
    'Who owes what',
    DebtorScoreboard,
    '<path d="M4 6h10M4 12h10M4 18h10"/><path d="m18 9 3 3-3 3"/>',
    'The five customers with money outstanding, overdue first, then nearest due date, then largest amount.',
  ),
  custom(
    'quotely-money-funnel',
    'Money-flow funnel',
    MoneyFunnel,
    '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
    'Approved quotes, deposits received and fully paid quotes, as a share of all approved quotes.',
  ),
  custom(
    'quotely-nudge-activity',
    'Nudge agent activity',
    NudgeActivity,
    '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'The latest reminders the nudge agent sent, scheduled, skipped or failed.',
  ),
];

// --- Cash movement: Studio's line chart with a denser value axis -----------------------
//
// Studio 3.0 has no setting for the y-axis tick interval: its format parser drops unknown axis
// keys, and AG Charts' default (one tick per 50px) leaves only 0 and 5K in a 272px card. Widget
// `options` are spread over the chart options, so this pre-configured copy of the built-in line
// chart (same form, same component) supplies its own axes. It is a separate type so that line
// charts created in Edit mode keep Studio's defaults.

const lineChart = (_ALL_WIDGET_DEFS as Partial<Record<string, unknown>>)['line-chart'];

const compactEuros = (value: number) =>
  value === 0 ? '0' : Math.abs(value) >= 1000 ? `${(value / 1000).toLocaleString('en-IE', { maximumFractionDigits: 1 })}K` : String(value);

const cashMovementWidget = lineChart && {
  ...(lineChart as unknown as CashMovementDefinition),
  id: 'quotely-cash-movement' as const,
  label: 'Cash movement (line)',
  extends: 'line-chart' as const,
  options: {
    axes: {
      // Weeks are dates, so the category axis is a time axis, labelled like the rest of the app.
      x: { type: 'time', label: { format: '%-d %b' }, gridLine: { enabled: false }, line: { stroke: '#2B3B3E', width: 1 } },
      y: {
        type: 'number',
        interval: { minSpacing: 26 },
        label: { formatter: ({ value }: { value: number }) => compactEuros(value) },
        gridLine: { enabled: true, style: [{ stroke: '#2B3B3E', strokeWidth: 1 }] },
      },
    },
  },
  ai: { label: 'Cash movement (line)', description: 'Line chart of weekly money in and money falling due, with a dense value axis.' },
} satisfies Partial<CashMovementDefinition>;

export const hasCashMovementWidget = Boolean(cashMovementWidget);

// --- Receivables grid cells ------------------------------------------------------------

const text = (p: CustomCellRendererProps) => String(p.valueFormatted ?? p.value ?? '');

const MoneyCell = (p: CustomCellRendererProps) => <span className="block text-right font-mono text-[13px] font-medium">{text(p)}</span>;
const MonoCell = (p: CustomCellRendererProps) => <span className="font-mono text-[12px] text-fg-2">{text(p)}</span>;
const StrongCell = (p: CustomCellRendererProps) => <span className="font-[650]">{text(p)}</span>;

/** "Balance due · Overdue 6d" -> stage pill plus overdue pill; the marker class tints the row (globals.css). */
const StageCell = (p: CustomCellRendererProps) => {
  if (!text(p)) return null; // e.g. the grand-total row
  const [stage, overdue] = text(p).split(' · ');
  const tone = stage.startsWith('Deposit') ? 'bg-state-deposit-due/15 text-state-deposit-due' : 'bg-state-balance-due/15 text-state-balance-due';
  return (
    <span className="flex h-full items-center gap-1.5">
      <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-[650] ${tone}`}>{stage}</span>
      {overdue && (
        <span className="quotely-overdue-row inline-flex h-6 items-center rounded-full bg-state-overdue/15 px-2.5 text-[12px] font-[650] text-state-overdue">
          {overdue}
        </span>
      )}
    </span>
  );
};

const CELLS: Record<string, ComponentType<CustomCellRendererProps>> = {
  'customers.company': StrongCell,
  'receivables.invoice': MonoCell,
  'receivables.stage': StageCell,
  'receivables.amountOwed': MoneyCell,
  'receivables.overdueAmount': MoneyCell,
  'receivables.dueDate': MonoCell,
  'payments.amount': MoneyCell,
};

const createCellRenderer = (field: AgWidgetField) => CELLS[field.fieldId] ?? (field.format === 'currencyFormat' ? MoneyCell : undefined);

export const quotelyWidgets = createWidgets<QuotelyRegistry>({
  additionalTypes: [...QUOTELY_WIDGETS, ...(cashMovementWidget ? [cashMovementWidget as CashMovementDefinition] : [])] as never,
  // Studio 3.0 types `overrides` as never once a registry adds custom widget types (its override
  // type isn't distributive over the union of widget ids); the value is the documented shape.
  overrides: [{ id: 'grid', options: { createCellRenderer } }] as never,
});
