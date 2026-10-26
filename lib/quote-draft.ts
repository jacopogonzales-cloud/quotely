// The editable shape of a draft quote and its validation rules. Pure and client-safe: the quote
// builder validates as you type, and the server validates the same way before saving or approving.

import type { LineMatch } from '@prisma/client';
import { splitDeposit } from './money';

export type DraftLine = {
  id: string;
  description: string;
  quantity: number;
  /** Null = "Needs a price". */
  unitPriceCents: number | null;
  priceListItemId: string | null;
  sourceText: string | null;
};

export type DraftInput = {
  title: string;
  location: string;
  /** YYYY-MM-DD or null */
  jobStartDate: string | null;
  jobEndDate: string | null;
  depositPercent: number;
  depositDueDate: string | null;
  customer: { company: string; contactName: string; email: string };
  lines: DraftLine[];
};

export type PriceListOption = { id: string; sku: string; name: string; unit: string; priceCents: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_QUANTITY = 100_000;
export const MAX_UNIT_PRICE_CENTS = 100_000_000; // €1,000,000.00

/** How a line relates to the price list. Decided from the data, never trusted from the client. */
export function lineMatch(line: Pick<DraftLine, 'unitPriceCents' | 'priceListItemId'>, listPriceCents?: number): LineMatch {
  if (line.unitPriceCents === null) return 'needs_price';
  if (line.priceListItemId && listPriceCents !== undefined) return line.unitPriceCents === listPriceCents ? 'matched' : 'edited';
  return 'manual';
}

export const lineAmount = (l: Pick<DraftLine, 'quantity' | 'unitPriceCents'>) => (l.unitPriceCents ?? 0) * l.quantity;

export function draftTotals(draft: { lines: Pick<DraftLine, 'quantity' | 'unitPriceCents'>[]; depositPercent: number }) {
  const totalCents = draft.lines.reduce((sum, l) => sum + lineAmount(l), 0);
  return { totalCents, ...splitDeposit(totalCents, draft.depositPercent) };
}

export const isValidQuantity = (q: number) => Number.isInteger(q) && q >= 1 && q <= MAX_QUANTITY;

export type DraftValidation = {
  lineErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }>;
  fieldErrors: Partial<Record<'email' | 'company' | 'depositPercent' | 'depositDueDate' | 'jobDates', string>>;
  /** Reasons approval is blocked, in the operator's words. Empty = ready to approve. */
  blockers: string[];
};

export function validateDraft(draft: DraftInput, today: string): DraftValidation {
  const lineErrors: DraftValidation['lineErrors'] = {};
  const fieldErrors: DraftValidation['fieldErrors'] = {};
  const blockers: string[] = [];

  let needsPrice = 0;
  let badLines = 0;
  for (const l of draft.lines) {
    const e: DraftValidation['lineErrors'][string] = {};
    if (!l.description.trim()) e.description = 'Describe the item';
    if (!isValidQuantity(l.quantity)) e.quantity = 'Enter a valid quantity';
    if (l.unitPriceCents === null) {
      e.unitPrice = 'A unit price is required';
      needsPrice++;
    } else if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0 || l.unitPriceCents > MAX_UNIT_PRICE_CENTS) {
      e.unitPrice = 'Enter a valid price';
      badLines++;
    }
    if (e.description || e.quantity) badLines++;
    if (Object.keys(e).length) lineErrors[l.id] = e;
  }

  if (draft.lines.length === 0) blockers.push('Add at least one item');
  if (needsPrice) blockers.push(`${needsPrice} ${needsPrice === 1 ? 'item needs' : 'items need'} a price`);
  if (badLines) blockers.push(`${badLines} ${badLines === 1 ? 'item has' : 'items have'} invalid details`);

  if (!draft.customer.company.trim()) fieldErrors.company = 'Enter the customer name';
  if (!EMAIL.test(draft.customer.email.trim())) fieldErrors.email = 'Enter a valid email; PayPal sends the invoice there';
  if (!Number.isInteger(draft.depositPercent) || draft.depositPercent < 1 || draft.depositPercent > 100) {
    fieldErrors.depositPercent = 'Use a whole percentage from 1 to 100';
  }
  if (!draft.depositDueDate || !ISO_DATE.test(draft.depositDueDate)) fieldErrors.depositDueDate = 'Choose a due date';
  else if (draft.depositDueDate < today) fieldErrors.depositDueDate = 'The due date must be today or later';
  if (draft.jobStartDate && draft.jobEndDate && draft.jobEndDate < draft.jobStartDate) {
    fieldErrors.jobDates = 'The job ends before it starts';
  }

  if (fieldErrors.company || fieldErrors.email) blockers.push('Customer details are incomplete');
  if (fieldErrors.depositPercent || fieldErrors.depositDueDate) blockers.push('Payment terms need attention');
  if (fieldErrors.jobDates) blockers.push('Job dates need attention');
  if (draft.lines.length > 0 && !needsPrice && !badLines && draftTotals(draft).totalCents <= 0) blockers.push('The total must be above €0.00');

  return { lineErrors, fieldErrors, blockers };
}

/** Checks the shape of a draft that arrived over the network. Throws on anything unexpected. */
export function parseDraftInput(input: unknown): DraftInput {
  const fail = (what: string): never => {
    throw new TypeError(`Invalid draft: ${what}`);
  };
  const str = (v: unknown, what: string, max = 500) =>
    typeof v === 'string' && v.length <= max ? v : fail(what);
  const day = (v: unknown, what: string) => (v === null ? null : str(v, what, 10));
  const obj = (v: unknown, what: string) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what);

  const d = obj(input, 'draft');
  const c = obj(d.customer, 'customer');
  if (!Array.isArray(d.lines) || d.lines.length > 200) fail('lines');
  const lines = (d.lines as unknown[]).map((raw, i) => {
    const l = obj(raw, `line ${i + 1}`);
    if (typeof l.quantity !== 'number') fail('quantity');
    if (l.unitPriceCents !== null && typeof l.unitPriceCents !== 'number') fail('unit price');
    return {
      id: str(l.id, 'line id', 64),
      description: str(l.description, 'description', 300),
      quantity: l.quantity as number,
      unitPriceCents: l.unitPriceCents as number | null,
      priceListItemId: l.priceListItemId === null ? null : str(l.priceListItemId, 'price list item', 64),
      sourceText: l.sourceText === null ? null : str(l.sourceText, 'source text', 500),
    };
  });
  if (typeof d.depositPercent !== 'number') fail('deposit percent');
  return {
    title: str(d.title, 'title', 200),
    location: str(d.location, 'location', 300),
    jobStartDate: day(d.jobStartDate, 'job start'),
    jobEndDate: day(d.jobEndDate, 'job end'),
    depositPercent: d.depositPercent as number,
    depositDueDate: day(d.depositDueDate, 'deposit due date'),
    customer: {
      company: str(c.company, 'company', 200),
      contactName: str(c.contactName, 'contact name', 200),
      email: str(c.email, 'email', 254),
    },
    lines,
  };
}
