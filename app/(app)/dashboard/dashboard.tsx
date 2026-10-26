'use client';

// The dashboard: Quotely's header around one AG Studio instance showing the "Cash Flow" report.
//
// - Studio is created once with the saved layout (this browser's customised one, if any, else
//   the built-in report in ./studio/report.ts), so the page always opens populated.
// - Fresh server data (e.g. after a payment) flows in through Studio's `data` property for the
//   native widgets and through ./store.ts for the custom ones.
// - "Customize dashboard" switches Studio to its real Edit mode; "Done customizing" returns to
//   view mode and keeps the layout in this browser.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AgStudioAiModule, enableStudioDevValidations, type AgPanelConfig, type AgReportState, type AgStudioApi, type AgStudioMode } from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { CalendarIcon, CheckIcon, SettingsIcon } from '@/components/icons';
import { PaymentWatcher } from '@/components/payment-watcher';
import { buildAi } from '@/components/studio/ai';
import { Button, Skeleton, cx } from '@/components/ui';
import type { CashflowData } from '@/lib/cashflow';
import { publishDashboard } from './store';
import { buildStudioData } from './studio/data';
import { cashFlowReport, REPORT_VERSION } from './studio/report';
import { quotelyStudioTheme } from './studio/theme';
import { quotelyWidgets, type QuotelyRegistry } from './studio/widgets';

if (process.env.NODE_ENV !== 'production') {
  enableStudioDevValidations();
}

type Props = {
  data: CashflowData;
  licenseKey?: string;
  aiModels?: string[];
  paypalConfigured: boolean;
};

type Report = AgReportState<QuotelyRegistry>;

const STORAGE_KEY = `quotely.dashboard.${REPORT_VERSION}`;

// Browser storage can be missing or throw (private windows, blocked storage): fall back quietly.
function loadSavedLayout(): Report | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Report;
  } catch {}
  return null;
}
function saveLayout(state: Report | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const QUOTELY_PROMPTS = [
  { label: 'Who should I chase first?', prompt: 'Which customers owe the most on overdue invoices, and how late are they?' },
  { label: 'Summarise cash this month', prompt: 'Summarise deposits and balances received this month and what is still outstanding.' },
  { label: 'Chart receivables by customer', prompt: 'Add a bar chart of amount owed by customer.' },
];

const noSubscription = () => () => {};

export function Dashboard(props: Props) {
  // The saved layout lives in localStorage, which only exists in the browser.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">{inBrowser ? <StudioDashboard {...props} /> : <DashboardSkeleton {...props} />}</div>
  );
}

function StudioDashboard({ data, licenseKey, aiModels, paypalConfigured }: Props) {
  const router = useRouter();
  const apiRef = useRef<AgStudioApi<QuotelyRegistry> | null>(null);
  const [mode, setMode] = useState<AgStudioMode>('view');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ready, setReady] = useState(false);
  // The built-in layout sizes its list widgets to today's data (see ./studio/report.ts).
  const builtIn = () =>
    cashFlowReport({
      debtors: data.debtors.length,
      receivables: data.receivables.length,
      nudges: data.nudges.length,
      nudgesWithReason: data.nudges.filter((n) => n.reason).length,
    });
  const [saved] = useState(loadSavedLayout);
  const [initialState] = useState(() => saved ?? builtIn());
  const [customised, setCustomised] = useState(saved !== null);

  const studioData = useMemo(() => buildStudioData(data), [data]);
  const ai = useMemo(() => (aiModels?.length ? buildAi(aiModels, QUOTELY_PROMPTS) : undefined), [aiModels]);

  // Custom widgets read the latest snapshot from the store.
  useEffect(() => {
    publishDashboard({ data, navigate: (href) => router.push(href) });
  }, [data, router]);

  const updateState = (next: (s: Report) => Report) => {
    const api = apiRef.current;
    if (api) api.setState(next(api.getState()));
  };

  // One filters control in view mode: the header button. Studio's filters panel is only placed
  // on the canvas while it is open (so no collapsed tab sits at the edge); closing it from its
  // own chevron closes it here too.
  const toggleFilters = () => {
    const open = !filtersOpen;
    setFiltersOpen(open);
    if (open) updateState((s) => ({ ...s, panels: { ...s.panels, filters: { ...s.panels?.filters, collapsed: false } } }));
  };
  const panels = useMemo<AgPanelConfig>(
    () => ({
      view: { right: filtersOpen ? ['filters'] : [] },
      // Declaring `view` turns off Studio's defaults for both modes, so `edit` restates them.
      edit: { left: ['ai'], right: ['filters', 'edit', 'data'] },
    }),
    [filtersOpen],
  );

  const startCustomizing = () => setMode('edit');

  // Studio opens every edit panel when it enters Edit mode. Fold the AI Assistant away again
  // (one click reopens it) so Compose, Data and the canvas fit side by side at 1440px.
  useEffect(() => {
    if (mode !== 'edit') return;
    const t = setTimeout(() => updateState((s) => ({ ...s, panels: { ...s.panels, ai: { ...s.panels?.ai, collapsed: true } } })), 0);
    return () => clearTimeout(t);
  }, [mode]);
  const doneCustomizing = () => {
    const api = apiRef.current;
    if (api) {
      saveLayout(api.getState());
      setCustomised(true);
    }
    setMode('view');
  };
  const resetLayout = () => {
    saveLayout(null);
    setCustomised(false);
    apiRef.current?.setState(builtIn());
    apiRef.current?.clearHistory();
  };

  return (
    <>
      <DashboardHeader paypalConfigured={paypalConfigured}>
        {mode === 'view' ? (
          <>
            <Button onClick={toggleFilters} aria-pressed={filtersOpen} disabled={!ready} className={cx(filtersOpen && 'border-accent/50 text-accent')}>
              Filters
            </Button>
            <Button variant="primary" onClick={startCustomizing} disabled={!ready}>
              <SettingsIcon /> Customize dashboard
            </Button>
          </>
        ) : (
          <>
            {customised && (
              <Button variant="ghost" onClick={resetLayout}>
                Reset layout
              </Button>
            )}
            <Button variant="primary" onClick={doneCustomizing}>
              <CheckIcon /> Done customizing
            </Button>
          </>
        )}
      </DashboardHeader>

      <div className="relative min-h-0 flex-1">
        {!ready && <CanvasSkeleton />}
        <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
          <AgStudio<QuotelyRegistry>
            style={{ height: '100%', width: '100%' }}
            theme={quotelyStudioTheme}
            widgets={quotelyWidgets}
            data={studioData}
            ai={ai}
            initialState={initialState}
            mode={mode}
            panels={panels}
            layout={{
              widgetBorderEnabled: true,
              widgetBorderColor: '#2B3B3E',
              widgetBorderWidth: 1,
              widgetBorderRadius: 14,
              // Space around each widget inside its grid cell: 8px a side makes the design's 16px gap.
              widgetPadding: 8,
              widgetBackgroundColor: '#111B1D',
              backgroundColor: '#080D0F',
            }}
            onApiReady={(event) => {
              // The event is typed with Studio's default registry; it is this instance's API.
              apiRef.current = event.api as unknown as AgStudioApi<QuotelyRegistry>;
            }}
            onStudioReady={() => setReady(true)}
            onStateUpdated={(event) => {
              if (mode === 'view' && filtersOpen && event.state.panels?.filters?.collapsed) setFiltersOpen(false);
            }}
          />
        </AgStudioProvider>
      </div>
    </>
  );
}

function DashboardHeader({ paypalConfigured, children }: { paypalConfigured: boolean; children?: React.ReactNode }) {
  return (
    <header className="flex h-[88px] shrink-0 items-center justify-between gap-6 px-6">
      <div>
        <h1 className="text-[26px] leading-[34px] font-[750] tracking-[-0.01em] text-fg">Money, moving.</h1>
        <p className="text-fg-2">Your quote-to-cash overview</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface-1 px-3 text-[13px] font-[650] text-fg-2">
          <CalendarIcon className="size-4" /> This month
        </span>
        <span className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface-1 px-3 text-[13px] font-[650] text-fg-2">
          <span className={`size-2 rounded-full ${paypalConfigured ? 'bg-state-deposit-paid' : 'bg-danger'}`} aria-hidden />
          {paypalConfigured ? 'PayPal connected' : 'PayPal not connected'}
        </span>
        <span className="hidden xl:block">
          <PaymentWatcher compact />
        </span>
        {children}
      </div>
    </header>
  );
}

function CanvasSkeleton() {
  // Mirrors the report's layout so nothing jumps when Studio arrives.
  return (
    <div className="absolute inset-0 z-10 grid grid-cols-24 content-start gap-4 bg-base px-6 pt-3" aria-hidden>
      {[6, 6, 6, 6].map((span, i) => (
        <Skeleton key={`k${i}`} className="col-span-6 h-[116px] rounded-card" />
      ))}
      <Skeleton className="col-span-14 h-[260px] rounded-card" />
      <Skeleton className="col-span-10 h-[260px] rounded-card" />
      <Skeleton className="col-span-16 h-[308px] rounded-card" />
      <Skeleton className="col-span-8 h-[308px] rounded-card" />
    </div>
  );
}

function DashboardSkeleton({ paypalConfigured }: Props) {
  return (
    <>
      <DashboardHeader paypalConfigured={paypalConfigured} />
      <div className="relative min-h-0 flex-1">
        <CanvasSkeleton />
      </div>
    </>
  );
}
