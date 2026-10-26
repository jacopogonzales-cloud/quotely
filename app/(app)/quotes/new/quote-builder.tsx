'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, CloseIcon, PinIcon, PlusIcon, SparkIcon } from '@/components/icons';
import { Button, Card, CardTitle, Label, StatePill, cx } from '@/components/ui';
import { formatDateRange } from '@/lib/dates';
import { centsToDecimal, formatMoney, parseMoney } from '@/lib/money';
import {
  draftTotals,
  isValidQuantity,
  lineAmount,
  lineMatch,
  validateDraft,
  type DraftInput,
  type DraftLine,
  type PriceListOption,
} from '@/lib/quote-draft';
import { Dialog } from '@/components/dialog';
import { formatDate } from '@/lib/dates';
import { draftWithAiAction, saveDraftAction } from '../../actions';
import { approveAndSendAction, retryInvoiceAction } from '../../payment-actions';

// The AI quote builder: the customer's words on the left (with what the AI read from them
// highlighted), the editable quote in the middle, and the approval summary on the right.
// Every committed edit is saved straight away; the server recomputes matches and totals.

type Fact = { kind: 'date' | 'location'; text: string };
type SaveState = 'saved' | 'saving' | 'error';

type Props = {
  quoteId: string;
  quoteNumber: string;
  request: { id: string; number: string; body: string; subject: string | null };
  initialDraft: DraftInput;
  facts: Fact[];
  notes: string[];
  aiDrafted: boolean;
  priceList: PriceListOption[];
  today: string;
};

export function QuoteBuilder({ quoteId, quoteNumber, request, initialDraft, facts, notes, aiDrafted, priceList, today }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [redrafting, setRedrafting] = useState(false);
  const [approving, setApproving] = useState(false);

  // Saves run one at a time; edits made during a save are sent right after it, newest only.
  const saving = useRef<{ inFlight: boolean; next: DraftInput | null }>({ inFlight: false, next: null });
  const save = async (next: DraftInput) => {
    const queue = saving.current;
    if (queue.inFlight) {
      queue.next = next;
      return;
    }
    queue.inFlight = true;
    setSaveState('saving');
    let toSave: DraftInput | null = next;
    let failed: string | null = null;
    while (toSave) {
      const result = await saveDraftAction(quoteId, toSave);
      failed = result.ok ? null : result.error;
      toSave = queue.next;
      queue.next = null;
    }
    queue.inFlight = false;
    setSaveState(failed ? 'error' : 'saved');
    setSaveError(failed);
  };

  /** Resolves once every queued edit has been saved. */
  const flushSaves = async () => {
    while (saving.current.inFlight) await new Promise((resolve) => setTimeout(resolve, 50));
  };

  const commit = (next: DraftInput) => {
    setDraft(next);
    void save(next);
  };
  const updateLine = (id: string, patch: Partial<DraftLine>) =>
    commit({ ...draft, lines: draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLine = (id: string) => commit({ ...draft, lines: draft.lines.filter((l) => l.id !== id) });
  const addLine = () => {
    const line: DraftLine = {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unitPriceCents: null,
      priceListItemId: null,
      sourceText: null,
    };
    commit({ ...draft, lines: [...draft.lines, line] });
    setSelectedLine(line.id);
  };

  const listPrice = useMemo(() => new Map(priceList.map((p) => [p.id, p])), [priceList]);
  const validation = validateDraft(draft, today);
  const totals = draftTotals(draft);
  const matched = draft.lines.filter((l) => {
    const m = lineMatch(l, l.priceListItemId ? listPrice.get(l.priceListItemId)?.priceCents : undefined);
    return m === 'matched' || m === 'edited';
  }).length;
  const needsPrice = draft.lines.filter((l) => l.unitPriceCents === null).length;

  const redraft = async () => {
    setRedrafting(true);
    const result = await draftWithAiAction(request.id, true);
    setRedrafting(false);
    if (result.ok) router.refresh();
    else setSaveError('We couldn’t redraft this request. Your current quote is unchanged.');
  };

  return (
    <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/inbox?id=${request.id}`}
            className="inline-flex items-center gap-1 text-[13px] font-[650] text-fg-2 hover:text-fg"
          >
            <ChevronLeftIcon className="size-4" /> Inbox
          </Link>
          <span className="h-4 w-px bg-line" aria-hidden />
          <h1 className="text-[20px] leading-7 font-bold">New quote</h1>
          <span className="font-mono text-[13px] text-fg-3">{quoteNumber}</span>
          <StatePill state="draft" />
        </div>
        <SaveIndicator state={saveState} error={saveError} />
      </div>

      <ApproveDialog
        open={approving}
        onClose={() => setApproving(false)}
        quoteId={quoteId}
        customer={draft.customer}
        depositCents={totals.depositCents}
        depositPercent={draft.depositPercent}
        dueDate={draft.depositDueDate}
        beforeSend={async () => {
          await flushSaves();
          return saving.current.next === null;
        }}
      />

      <div className="grid grid-cols-[280px_minmax(516px,1fr)_324px] items-start gap-5">
        <SourcePanel
          request={request}
          lines={draft.lines}
          facts={facts}
          selectedLine={selectedLine}
          onSelectLine={(id) => {
            setSelectedLine(id);
            document.getElementById(`line-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <CustomerCard draft={draft} errors={validation.fieldErrors} onChange={commit} />
          <ItemsCard
            lines={draft.lines}
            errors={validation.lineErrors}
            priceList={priceList}
            listPrice={listPrice}
            selectedLine={selectedLine}
            onSelect={setSelectedLine}
            onUpdate={updateLine}
            onRemove={removeLine}
            onAdd={addLine}
            totalCents={totals.totalCents}
          />
        </div>

        <div className="sticky top-4 flex flex-col gap-5">
          <ReviewCard
            aiDrafted={aiDrafted}
            lines={draft.lines.length}
            matched={matched}
            needsPrice={needsPrice}
            dates={draft.jobStartDate ? formatDateRange(draft.jobStartDate, draft.jobEndDate) : null}
            notes={notes}
            blockers={validation.blockers}
            redrafting={redrafting}
            onRedraft={redraft}
          />
          <SummaryCard
            draft={draft}
            errors={validation.fieldErrors}
            totals={totals}
            blockers={validation.blockers}
            onChange={commit}
            onApprove={() => setApproving(true)}
          />
        </div>
      </div>
    </div>
  );
}

// --- Save status ---------------------------------------------------------------------

function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (error && state !== 'saving') {
    return (
      <span role="alert" className="flex items-center gap-2 text-[13px] text-danger">
        <AlertIcon className="size-4" /> {error}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-[13px] text-fg-3" aria-live="polite">
      {state === 'saving' ? (
        <>
          <span className="size-3 animate-spin rounded-full border-2 border-fg-3/30 border-t-fg-3" aria-hidden /> Saving…
        </>
      ) : (
        <>
          <CheckIcon className="size-4" /> Draft saved
        </>
      )}
    </span>
  );
}

// --- Source text ---------------------------------------------------------------------

type Mark = { start: number; end: number; lineId?: string; fact?: Fact['kind'] };

/** Non-overlapping ranges of `body` to highlight: first occurrence of each phrase, lines first. */
function findMarks(body: string, lines: DraftLine[], facts: Fact[]): Mark[] {
  const lower = body.toLowerCase();
  const marks: Mark[] = [];
  const place = (phrase: string, mark: Omit<Mark, 'start' | 'end'>) => {
    const needle = phrase.toLowerCase();
    for (let from = 0; ; ) {
      const start = lower.indexOf(needle, from);
      if (start < 0) return;
      const end = start + needle.length;
      if (!marks.some((m) => start < m.end && end > m.start)) {
        marks.push({ start, end, ...mark });
        return;
      }
      from = start + 1;
    }
  };
  for (const l of lines) if (l.sourceText) place(l.sourceText, { lineId: l.id });
  for (const f of facts) place(f.text, { fact: f.kind });
  return marks.sort((a, b) => a.start - b.start);
}

function SourcePanel({
  request,
  lines,
  facts,
  selectedLine,
  onSelectLine,
}: {
  request: Props['request'];
  lines: DraftLine[];
  facts: Fact[];
  selectedLine: string | null;
  onSelectLine: (id: string) => void;
}) {
  const marks = findMarks(request.body, lines, facts);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) parts.push(request.body.slice(at, m.start));
    const text = request.body.slice(m.start, m.end);
    if (m.lineId) {
      const id = m.lineId;
      parts.push(
        <mark
          key={`l-${m.start}`}
          id={`source-${id}`}
          onClick={() => onSelectLine(id)}
          className={cx(
            'cursor-pointer rounded-[4px] px-0.5 text-fg transition-colors duration-[120ms]',
            id === selectedLine ? 'bg-accent/35 ring-1 ring-accent' : 'bg-accent/12 hover:bg-accent/25',
          )}
        >
          {text}
        </mark>,
      );
    } else {
      parts.push(
        <mark key={`f-${m.start}`} className="rounded-[4px] bg-state-sent/15 px-0.5 text-fg" title={m.fact === 'date' ? 'Job dates' : 'Location'}>
          {text}
        </mark>,
      );
    }
    at = m.end;
  }
  if (at < request.body.length) parts.push(request.body.slice(at));

  return (
    <Card className="sticky top-4 flex max-h-[calc(100dvh-180px)] flex-col overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <Label>Customer request</Label>
          <span className="font-mono text-[11px] text-fg-3">{request.number}</span>
        </div>
        {request.subject && <div className="mt-1 text-[13px] font-[650] text-fg">{request.subject}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px] leading-[21px] whitespace-pre-wrap text-fg-2">{parts}</div>
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2.5 text-[11px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-accent/40" aria-hidden /> Line item
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-state-sent/40" aria-hidden /> Date or place
        </span>
      </div>
    </Card>
  );
}

// --- Inputs --------------------------------------------------------------------------

const INPUT =
  'h-11 w-full rounded-control border bg-surface-2 px-3 text-fg placeholder:text-fg-3 hover:border-line-strong focus:border-focus focus:outline-none';

/** A text field that commits on blur or Enter and reverts on Escape. */
function TextField({
  label,
  value,
  onCommit,
  error,
  type = 'text',
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  error?: string;
  type?: 'text' | 'email' | 'date';
  placeholder?: string;
  icon?: ReactNode;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] leading-[18px] font-[650] text-fg-3">{label}</span>
      <span className="relative">
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3">{icon}</span>}
        <input
          type={type}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(value);
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
          aria-invalid={Boolean(error)}
          className={cx(INPUT, Boolean(icon) && 'pl-9', type === 'date' && 'font-mono text-[13px] [color-scheme:dark]', error ? 'border-danger' : 'border-line')}
        />
      </span>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </label>
  );
}

function CustomerCard({
  draft,
  errors,
  onChange,
}: {
  draft: DraftInput;
  errors: ReturnType<typeof validateDraft>['fieldErrors'];
  onChange: (next: DraftInput) => void;
}) {
  const setCustomer = (patch: Partial<DraftInput['customer']>) => onChange({ ...draft, customer: { ...draft.customer, ...patch } });
  return (
    <Card className="p-5">
      <CardTitle>Customer & job</CardTitle>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <TextField label="Company" value={draft.customer.company} error={errors.company} onCommit={(v) => setCustomer({ company: v })} />
        <TextField label="Contact" value={draft.customer.contactName} onCommit={(v) => setCustomer({ contactName: v })} />
        <TextField
          label="Email for the PayPal invoice"
          type="email"
          value={draft.customer.email}
          error={errors.email}
          placeholder="name@company.com"
          onCommit={(v) => setCustomer({ email: v.trim() })}
        />
        <TextField label="Job" value={draft.title} onCommit={(v) => onChange({ ...draft, title: v })} />
        <div className="col-span-2">
          <TextField
            label="Location"
            value={draft.location}
            icon={<PinIcon className="size-4" />}
            onCommit={(v) => onChange({ ...draft, location: v })}
          />
        </div>
        <TextField
          label="Job starts"
          type="date"
          value={draft.jobStartDate ?? ''}
          onCommit={(v) => onChange({ ...draft, jobStartDate: v || null, jobEndDate: draft.jobEndDate && v && draft.jobEndDate < v ? v : draft.jobEndDate })}
        />
        <TextField
          label="Job ends"
          type="date"
          value={draft.jobEndDate ?? ''}
          error={errors.jobDates}
          onCommit={(v) => onChange({ ...draft, jobEndDate: v || null })}
        />
      </div>
    </Card>
  );
}

// --- Line items ----------------------------------------------------------------------

/** An inline table cell: commits on blur/Enter, Escape reverts, invalid input stays local with its message. */
function CellInput({
  value,
  parse,
  onCommit,
  label,
  align = 'left',
  mono,
  externalError,
  placeholder,
}: {
  value: string;
  parse: (text: string) => { ok: true; value: unknown } | { ok: false; error: string };
  onCommit: (value: unknown) => void;
  label: string;
  align?: 'left' | 'right';
  mono?: boolean;
  externalError?: { text: string; tone: 'warning' | 'danger' };
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  const [error, setError] = useState<string | null>(null);
  if (value !== prev) {
    setPrev(value);
    setText(value);
    setError(null);
  }
  const commit = () => {
    if (text === value) return setError(null);
    const parsed = parse(text);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    onCommit(parsed.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setText(value);
      setError(null);
      const input = e.currentTarget;
      requestAnimationFrame(() => input.blur());
    }
  };
  const shown = error ? { text: error, tone: 'danger' as const } : externalError;
  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-invalid={Boolean(shown)}
        className={cx(
          'h-9 w-full rounded-[8px] border bg-transparent px-2 text-[13px] text-fg placeholder:text-fg-3 hover:border-line-strong hover:bg-surface-2 focus:border-focus focus:bg-surface-2 focus:outline-none',
          align === 'right' && 'text-right',
          mono && 'font-mono',
          shown?.tone === 'danger' ? 'border-danger' : shown?.tone === 'warning' ? 'border-state-deposit-due/60' : 'border-transparent',
        )}
      />
      {shown && (
        <span className={cx('text-[11px] leading-4', align === 'right' && 'text-right', shown.tone === 'danger' ? 'text-danger' : 'text-state-deposit-due')}>
          {shown.text}
        </span>
      )}
    </div>
  );
}

const parseQuantity = (text: string) => {
  const n = Number(text.trim());
  return isValidQuantity(n) ? { ok: true as const, value: n } : { ok: false as const, error: 'Enter a valid quantity' };
};
const parsePrice = (text: string) => {
  if (!text.trim()) return { ok: true as const, value: null };
  const cents = parseMoney(text);
  return cents === null ? { ok: false as const, error: 'Enter a valid price' } : { ok: true as const, value: cents };
};
const parseDescription = (text: string) =>
  text.trim() ? { ok: true as const, value: text.trim() } : { ok: false as const, error: 'Describe the item' };

function MatchIndicator({ line, listPriceCents }: { line: DraftLine; listPriceCents?: number }) {
  const match = lineMatch(line, listPriceCents);
  if (match === 'matched')
    return (
      <span className="flex items-center gap-1 text-[11px] font-[550] text-state-deposit-paid">
        <CheckIcon className="size-3.5" /> Matched to price list
      </span>
    );
  if (match === 'edited')
    return (
      <span className="flex items-center gap-1 text-[11px] font-[550] text-state-sent" title={`List price ${formatMoney(listPriceCents ?? 0)}`}>
        Edited from price list · list {formatMoney(listPriceCents ?? 0)}
      </span>
    );
  if (match === 'needs_price')
    return (
      <span className="flex items-center gap-1 text-[11px] font-[550] text-state-deposit-due">
        <AlertIcon className="size-3.5" /> Needs review · not on price list
      </span>
    );
  return <span className="text-[11px] font-[550] text-fg-3">Priced manually</span>;
}

function ItemsCard({
  lines,
  errors,
  priceList,
  listPrice,
  selectedLine,
  onSelect,
  onUpdate,
  onRemove,
  onAdd,
  totalCents,
}: {
  lines: DraftLine[];
  errors: ReturnType<typeof validateDraft>['lineErrors'];
  priceList: PriceListOption[];
  listPrice: Map<string, PriceListOption>;
  selectedLine: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<DraftLine>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  totalCents: number;
}) {
  const choose = (line: DraftLine, itemId: string) => {
    const item = listPrice.get(itemId);
    if (!item) return onUpdate(line.id, { priceListItemId: null });
    onUpdate(line.id, { priceListItemId: item.id, description: item.name, unitPriceCents: item.priceCents });
  };

  return (
    <Card className="p-5">
      <CardTitle aside={<span className="text-[12px] text-fg-3">Enter to save · Esc to undo</span>}>Line items</CardTitle>
      {lines.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-10 text-center">
          <p className="text-fg-2">No items yet.</p>
          <Button variant="primary" size="sm" onClick={onAdd}>
            <PlusIcon className="size-4" /> Add item
          </Button>
        </div>
      ) : (
        <>
          <table className="mt-3 w-full table-fixed border-collapse text-left">
            <colgroup>
              <col />
              <col className="w-[76px]" />
              <col className="w-[116px]" />
              <col className="w-[112px]" />
              <col className="w-9" />
            </colgroup>
            <thead className="text-[12px] text-fg-3">
              <tr className="h-9 border-b border-line">
                <th className="px-2 font-[650]">Item</th>
                <th className="px-2 text-right font-[650]">Qty</th>
                <th className="px-2 text-right font-[650]">Unit price</th>
                <th className="px-2 text-right font-[650]">Amount</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const item = line.priceListItemId ? listPrice.get(line.priceListItemId) : undefined;
                const e = errors[line.id] ?? {};
                const selected = line.id === selectedLine;
                return (
                  <tr
                    key={line.id}
                    id={`line-${line.id}`}
                    onFocusCapture={() => {
                      if (!selected) {
                        onSelect(line.id);
                        document.getElementById(`source-${line.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }}
                    onClick={() => onSelect(line.id)}
                    style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                    className={cx(
                      'animate-row-in border-b border-line align-top transition-colors duration-[120ms]',
                      selected ? 'bg-surface-2/70' : 'hover:bg-surface-2/40',
                    )}
                  >
                    <td className="px-1 py-2">
                      <CellInput
                        label="Item"
                        value={line.description}
                        parse={parseDescription}
                        onCommit={(v) => onUpdate(line.id, { description: v as string })}
                        placeholder="Describe the item"
                        externalError={e.description ? { text: e.description, tone: 'danger' } : undefined}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
                        <MatchIndicator line={line} listPriceCents={item?.priceCents} />
                        <select
                          aria-label="Price list item"
                          value={line.priceListItemId ?? ''}
                          onChange={(ev) => choose(line, ev.target.value)}
                          className="h-6 max-w-[220px] truncate rounded-badge border border-line bg-surface-2 px-1 text-[11px] text-fg-2 hover:border-line-strong focus:border-focus focus:outline-none"
                        >
                          <option value="">Not on price list</option>
                          {priceList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {formatMoney(p.priceCents)} {p.unit}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-1 py-2">
                      <CellInput
                        label="Quantity"
                        value={String(line.quantity)}
                        parse={parseQuantity}
                        onCommit={(v) => onUpdate(line.id, { quantity: v as number })}
                        align="right"
                        mono
                      />
                    </td>
                    <td className="px-1 py-2">
                      <CellInput
                        label="Unit price"
                        value={line.unitPriceCents === null ? '' : centsToDecimal(line.unitPriceCents)}
                        parse={parsePrice}
                        onCommit={(v) => onUpdate(line.id, { unitPriceCents: v as number | null })}
                        align="right"
                        mono
                        placeholder="0.00"
                        externalError={e.unitPrice ? { text: e.unitPrice, tone: line.unitPriceCents === null ? 'warning' : 'danger' } : undefined}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex h-9 items-center justify-end font-mono text-[13px] font-medium text-fg">
                        {line.unitPriceCents === null ? <span className="text-fg-3">—</span> : formatMoney(lineAmount(line))}
                      </div>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onRemove(line.id);
                        }}
                        aria-label={`Remove ${line.description || 'item'}`}
                        className="flex size-9 items-center justify-center rounded-[8px] text-fg-3 hover:bg-surface-3 hover:text-danger"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onAdd}>
              <PlusIcon className="size-4" /> Add item
            </Button>
            <div className="flex items-baseline gap-4 px-2">
              <span className="text-[12px] font-[650] text-fg-3">Total</span>
              <span className="font-mono text-[16px] font-semibold text-fg">{formatMoney(totalCents)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// --- Right rail ----------------------------------------------------------------------

function ReviewCard({
  aiDrafted,
  lines,
  matched,
  needsPrice,
  dates,
  notes,
  blockers,
  redrafting,
  onRedraft,
}: {
  aiDrafted: boolean;
  lines: number;
  matched: number;
  needsPrice: number;
  dates: string | null;
  notes: string[];
  blockers: string[];
  redrafting: boolean;
  onRedraft: () => void;
}) {
  const ready = blockers.length === 0;
  const checks = [
    { ok: lines > 0 && matched === lines, text: `${matched} of ${lines} ${lines === 1 ? 'item' : 'items'} matched to your price list` },
    ...(needsPrice ? [{ ok: false, text: `${needsPrice} ${needsPrice === 1 ? 'item needs' : 'items need'} a price` }] : []),
    { ok: Boolean(dates), text: dates ? `Dates recognized · ${dates}` : 'No job dates yet' },
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <SparkIcon className="size-4 text-accent" />
        <h3 className="text-[14px] font-bold">{aiDrafted ? 'AI review' : 'Review'}</h3>
      </div>
      <p className={cx('mt-2 font-[650]', ready ? 'text-accent' : 'text-fg')}>
        {ready ? 'Draft ready · Review before sending' : 'Almost there'}
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-[13px]">
        {checks.map((c) => (
          <li key={c.text} className="flex gap-2">
            {c.ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-state-deposit-paid" /> : <AlertIcon className="mt-0.5 size-4 shrink-0 text-state-deposit-due" />}
            <span className={c.ok ? 'text-fg-2' : 'text-fg'}>{c.text}</span>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <>
          <Label className="mt-4">Worth checking</Label>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13px] text-fg-2 marker:text-fg-3">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
      <Button variant="ghost" size="sm" className="mt-3 -ml-3" onClick={onRedraft} disabled={redrafting}>
        <SparkIcon className="size-4" /> {redrafting ? 'Redrafting…' : aiDrafted ? 'Redraft with AI' : 'Draft with AI'}
      </Button>
    </Card>
  );
}

function SummaryCard({
  draft,
  errors,
  totals,
  blockers,
  onChange,
  onApprove,
}: {
  draft: DraftInput;
  errors: ReturnType<typeof validateDraft>['fieldErrors'];
  totals: ReturnType<typeof draftTotals>;
  blockers: string[];
  onChange: (next: DraftInput) => void;
  onApprove: () => void;
}) {
  const parsePercent = (text: string) => {
    const n = Number(text.trim().replace('%', ''));
    return Number.isInteger(n) && n >= 1 && n <= 100 ? { ok: true as const, value: n } : { ok: false as const, error: 'Use 1 to 100' };
  };
  return (
    <Card className="p-5">
      <h3 className="text-[14px] font-bold">Payment terms</h3>
      <div className="mt-3 grid grid-cols-[96px_1fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-[650] text-fg-3">Deposit</span>
          <div className="flex items-start gap-1.5">
            <CellInput
              label="Deposit percentage"
              value={String(draft.depositPercent)}
              parse={parsePercent}
              onCommit={(v) => onChange({ ...draft, depositPercent: v as number })}
              align="right"
              mono
            />
            <span className="flex h-9 items-center text-fg-3">%</span>
          </div>
        </div>
        <TextField
          label="Deposit due"
          type="date"
          value={draft.depositDueDate ?? ''}
          error={errors.depositDueDate}
          icon={<CalendarIcon className="size-4" />}
          onCommit={(v) => onChange({ ...draft, depositDueDate: v || null })}
        />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <Label>Total</Label>
        <div className="font-mono text-[44px] leading-[52px] font-bold tracking-tight text-fg">{formatMoney(totals.totalCents)}</div>
        <dl className="mt-3 flex flex-col gap-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-fg-2">Deposit ({draft.depositPercent}%)</dt>
            <dd className="font-mono font-medium text-fg">{formatMoney(totals.depositCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-2">Balance after the job</dt>
            <dd className="font-mono text-fg-2">{formatMoney(totals.balanceCents)}</dd>
          </div>
        </dl>
      </div>

      <Button variant="primary" className="mt-5 w-full" disabled={blockers.length > 0} onClick={onApprove}>
        Approve & send deposit invoice
      </Button>
      {blockers.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-[12px] text-state-deposit-due">
          {blockers.map((b) => (
            <li key={b} className="flex items-center gap-1.5">
              <AlertIcon className="size-3.5 shrink-0" /> {b}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-fg-3">PayPal emails the invoice to the customer. You confirm before anything is sent.</p>
      )}
    </Card>
  );
}

// --- Approval ------------------------------------------------------------------------

type Sending =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'checking' }
  | { kind: 'sent'; amountCents: number }
  | { kind: 'error'; message: string; paypal: boolean };

const PAYPAL_FAILED = 'PayPal couldn’t send this invoice. No payment was requested.';

function ApproveDialog({
  open,
  onClose,
  quoteId,
  customer,
  depositCents,
  depositPercent,
  dueDate,
  beforeSend,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  customer: DraftInput['customer'];
  depositCents: number;
  depositPercent: number;
  dueDate: string | null;
  beforeSend: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Sending>({ kind: 'idle' });

  const finish = (amountCents: number) => {
    setStatus({ kind: 'sent', amountCents });
    setTimeout(() => router.push(`/quotes/${quoteId}`), 900);
  };

  const send = async () => {
    setStatus({ kind: 'sending' });
    if (!(await beforeSend())) {
      setStatus({ kind: 'error', message: 'Your latest edits couldn’t be saved. Nothing was sent.', paypal: false });
      return;
    }
    const result = await approveAndSendAction(quoteId);
    if (result.ok) finish(result.data.amountCents);
    else setStatus({ kind: 'error', message: result.error, paypal: result.error === PAYPAL_FAILED });
  };

  // After a PayPal failure the quote is approved: retrying reconciles the same invoice.
  const retry = async () => {
    setStatus({ kind: 'checking' });
    const result = await retryInvoiceAction(quoteId, 'deposit');
    if (result.ok) finish(result.data.amountCents);
    else setStatus({ kind: 'error', message: result.error, paypal: true });
  };

  const sending = status.kind === 'sending' || status.kind === 'checking' || status.kind === 'sent';
  const failedAtPayPal = status.kind === 'error' && status.paypal;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (failedAtPayPal) router.push(`/quotes/${quoteId}`);
        else {
          setStatus({ kind: 'idle' });
          onClose();
        }
      }}
      title="Ready to request the deposit?"
      dismissible={!sending}
      footer={
        status.kind === 'checking' ? (
          <Button variant="primary" disabled>
            Checking invoice status…
          </Button>
        ) : failedAtPayPal ? (
          <>
            <Button onClick={() => router.push(`/quotes/${quoteId}`)}>View quote</Button>
            <Button variant="primary" onClick={retry}>
              Retry sending
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                setStatus({ kind: 'idle' });
                onClose();
              }}
              disabled={sending}
            >
              Keep editing
            </Button>
            <Button variant="primary" onClick={send} disabled={sending}>
              {status.kind === 'sending' ? 'Sending invoice…' : 'Create & send PayPal invoice'}
            </Button>
          </>
        )
      }
    >
      <p className="text-fg-2">Quotely approves this quote and PayPal emails a deposit invoice to your customer.</p>
      <dl className="mt-4 flex flex-col gap-2 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-3">Customer</dt>
          <dd className="text-right text-fg">{customer.company}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-3">Email</dt>
          <dd className="text-right text-fg">{customer.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-3">Deposit</dt>
          <dd className="text-right font-mono font-semibold text-fg">
            {formatMoney(depositCents)} ({depositPercent}%)
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-3">Due date</dt>
          <dd className="text-right font-mono text-fg">{dueDate ? formatDate(`${dueDate}T12:00:00Z`) : '—'}</dd>
        </div>
      </dl>
      <div aria-live="polite">
        {status.kind === 'sent' && (
          <p className="mt-4 flex items-center gap-2 font-[650] text-accent">
            <CheckIcon className="size-4" /> Deposit invoice sent · {formatMoney(status.amountCents)} requested
          </p>
        )}
        {status.kind === 'error' && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" /> {status.message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
