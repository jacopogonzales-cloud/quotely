// Quote extraction: request text in, a checked draft structure out. The model only reads and
// matches; it never sees or returns prices. Everything it returns is validated here before use.

import { isoDay } from '../dates';
import { EXTRACTION_INSTRUCTIONS, EXTRACTION_SCHEMA, extractionInput } from './prompts';
import { respondJson } from './respond';

type RawExtraction = {
  customer: { company: string | null; contactName: string | null; email: string | null };
  job: {
    title: string;
    location: string | null;
    locationText: string | null;
    startDate: string | null;
    endDate: string | null;
    dateText: string | null;
  };
  lines: { description: string; quantity: number; sku: string | null; sourceText: string }[];
  notes: string[];
};

export type Extraction = {
  customer: { company: string | null; contactName: string | null; email: string | null };
  job: {
    title: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  lines: { description: string; quantity: number; sku: string | null; sourceText: string | null }[];
  /** Verbatim phrases of the request to highlight as recognised facts. */
  facts: { kind: 'date' | 'location'; text: string }[];
  notes: string[];
};

type PriceListEntry = { sku: string; name: string; unit: string; aliases: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The phrase exactly as it appears in `text` (case-insensitive search), or null if it isn't there. */
export function findVerbatim(text: string, phrase: string | null | undefined): string | null {
  if (!phrase?.trim()) return null;
  const at = text.toLowerCase().indexOf(phrase.trim().toLowerCase());
  return at < 0 ? null : text.slice(at, at + phrase.trim().length);
}

const validDate = (d: string | null) => (d && ISO_DATE.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

export async function extractQuote(requestText: string, priceList: PriceListEntry[], now = new Date()): Promise<Extraction> {
  const raw = await respondJson<RawExtraction>({
    name: 'quote_extraction',
    instructions: EXTRACTION_INSTRUCTIONS,
    input: extractionInput({ requestText, priceList, referenceDate: isoDay(now) }),
    schema: EXTRACTION_SCHEMA,
  });
  return sanitise(raw, requestText, priceList);
}

/** Drops anything the model made up: unknown SKUs, phrases not in the request, impossible quantities and dates. */
export function sanitise(raw: RawExtraction, requestText: string, priceList: PriceListEntry[]): Extraction {
  const skus = new Set(priceList.map((p) => p.sku));
  const notes = (raw.notes ?? []).filter((n) => typeof n === 'string' && n.trim()).slice(0, 4);

  const lines = (raw.lines ?? [])
    .filter((l) => l && typeof l.description === 'string' && l.description.trim())
    .map((l) => {
      const quantityOk = Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 100_000;
      if (!quantityOk) notes.push(`Check the quantity for "${l.description.trim()}".`);
      return {
        description: l.description.trim(),
        quantity: quantityOk ? l.quantity : 1,
        sku: l.sku && skus.has(l.sku) ? l.sku : null,
        sourceText: findVerbatim(requestText, l.sourceText),
      };
    });

  let startDate = validDate(raw.job?.startDate ?? null);
  let endDate = validDate(raw.job?.endDate ?? null) ?? startDate;
  if (!startDate && endDate) startDate = endDate;
  if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];

  const email = raw.customer?.email?.trim() ?? null;
  const facts: Extraction['facts'] = [];
  const dateText = findVerbatim(requestText, raw.job?.dateText);
  const locationText = findVerbatim(requestText, raw.job?.locationText);
  if (dateText && startDate) facts.push({ kind: 'date', text: dateText });
  if (locationText) facts.push({ kind: 'location', text: locationText });

  return {
    customer: {
      company: raw.customer?.company?.trim() || null,
      contactName: raw.customer?.contactName?.trim() || null,
      email: email && EMAIL.test(email) ? email : null,
    },
    job: {
      title: raw.job?.title?.trim() || 'New job',
      location: raw.job?.location?.trim() || null,
      startDate,
      endDate,
    },
    lines,
    facts,
    notes,
  };
}
