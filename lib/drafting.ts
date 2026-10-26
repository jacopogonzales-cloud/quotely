// Requests and draft quotes: adding a request to the inbox, drafting a quote from it with AI (or
// by hand), and saving the operator's edits. Server-only. Prices only ever come from the price
// list or from the operator; a line without either stays "Needs a price".

import { Prisma } from '@prisma/client';
import { extractQuote, type Extraction } from './ai/extract';
import { DAY_MS, isoDay } from './dates';
import { db } from './db';
import { draftTotals, lineMatch, validateDraft, type DraftInput } from './quote-draft';

// --- Numbering ---------------------------------------------------------------------

/** Next "Q-1042" / "REQ-2052". Numbers have equal width, so the string order is the numeric order. */
async function nextNumber(kind: 'quote' | 'request'): Promise<string> {
  const latest =
    kind === 'quote'
      ? await db.quote.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      : await db.incomingRequest.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
  const prefix = kind === 'quote' ? 'Q-' : 'REQ-';
  const n = latest ? Number(latest.number.slice(prefix.length)) + 1 : kind === 'quote' ? 1001 : 2001;
  return `${prefix}${n}`;
}

/** Retries once when two drafts race for the same number (unique constraint). */
async function withNumber<T>(kind: 'quote' | 'request', create: (number: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await create(await nextNumber(kind));
    } catch (err) {
      const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!duplicate || attempt >= 3) throw err;
    }
  }
}

// --- Dates -------------------------------------------------------------------------

/** "2026-11-12" -> midday UTC that day, so the calendar day survives any European time zone. */
export const dayToDate = (day: string | null) => (day ? new Date(`${day}T12:00:00Z`) : null);

/** Deposit due in 7 days, but no later than the day before the job (and never before today). */
function defaultDepositDueDate(jobStart: string | null, now: Date): string {
  const today = isoDay(now);
  let due = isoDay(new Date(now.getTime() + 7 * DAY_MS));
  if (jobStart) {
    const dayBefore = isoDay(new Date(Date.parse(`${jobStart}T12:00:00Z`) - DAY_MS));
    if (dayBefore < due) due = dayBefore;
  }
  return due < today ? today : due;
}

// --- Requests ----------------------------------------------------------------------

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export async function addRequest(text: string) {
  const body = text.trim();
  const fromEmail = body.match(EMAIL_IN_TEXT)?.[0]?.toLowerCase() ?? null;
  const subject = body.match(/^subject:\s*(.+)$/im)?.[1]?.trim() ?? null;
  return withNumber('request', (number) =>
    db.incomingRequest.create({ data: { number, body, fromEmail, subject, source: 'paste' } }),
  );
}

// --- Drafting ----------------------------------------------------------------------

export type DraftOutcome = { quoteId: string; requestId: string; matched: number; needsPrice: number; lines: number };

async function activePriceList() {
  return db.priceListItem.findMany({ where: { active: true }, orderBy: { sku: 'asc' } });
}

async function resolveCustomer(
  request: { customerId: string | null; fromEmail: string | null; fromCompany: string | null; fromName: string | null },
  extracted: Extraction['customer'] | null,
) {
  if (request.customerId) return request.customerId;
  const email = (extracted?.email ?? request.fromEmail ?? '').toLowerCase();
  if (email) {
    const existing = await db.customer.findFirst({ where: { email } });
    if (existing) return existing.id;
  }
  const created = await db.customer.create({
    data: {
      company: extracted?.company ?? request.fromCompany ?? extracted?.contactName ?? request.fromName ?? 'New customer',
      contactName: extracted?.contactName ?? request.fromName,
      email,
    },
  });
  return created.id;
}

/**
 * Drafts a quote for a request with AI. Returns the existing draft unless `regenerate` is set,
 * in which case the draft's lines and job details are rebuilt in place (same quote number).
 * Throws AiError when the model can't be reached or answers badly; nothing is saved then.
 */
export async function draftQuoteWithAi(requestId: string, { regenerate = false } = {}): Promise<DraftOutcome> {
  const request = await db.incomingRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error('Request not found');

  const existing = await db.quote.findFirst({ where: { requestId }, orderBy: { createdAt: 'desc' }, include: { lines: true } });
  if (existing && (existing.state !== 'draft' || !regenerate)) return summarise(existing.id, requestId, existing.lines);

  const priceList = await activePriceList();
  const now = new Date();
  const extraction = await extractQuote(request.body, priceList, now);
  const bySku = new Map(priceList.map((p) => [p.sku, p]));

  const lines = extraction.lines.map((l, i) => {
    const item = l.sku ? bySku.get(l.sku) : undefined;
    return {
      position: i + 1,
      description: item?.name ?? l.description,
      quantity: l.quantity,
      unitPriceCents: item?.priceCents ?? null,
      priceListItemId: item?.id ?? null,
      match: item ? ('matched' as const) : ('needs_price' as const),
      sourceText: l.sourceText,
    };
  });
  const depositPercent = existing?.depositPercent ?? 30;
  const totals = draftTotals({ lines, depositPercent });
  const job = {
    title: extraction.job.title,
    location: extraction.job.location,
    jobStartDate: dayToDate(extraction.job.startDate),
    jobEndDate: dayToDate(extraction.job.endDate),
    depositDueDate: dayToDate(defaultDepositDueDate(extraction.job.startDate, now)),
    ...totals,
  };
  const matched = lines.filter((l) => l.match === 'matched').length;
  const message = `Quote drafted by AI from ${request.number} · ${matched} of ${lines.length} items matched to the price list`;

  const customerId = await resolveCustomer(request, extraction.customer);
  await db.incomingRequest.update({
    where: { id: requestId },
    data: {
      status: 'drafted',
      customerId,
      extraction: JSON.stringify(extraction),
      fromCompany: request.fromCompany ?? extraction.customer.company,
      fromName: request.fromName ?? extraction.customer.contactName,
      fromEmail: request.fromEmail ?? extraction.customer.email,
    },
  });

  let quoteId: string;
  if (existing) {
    await db.$transaction([
      db.quoteLine.deleteMany({ where: { quoteId: existing.id } }),
      db.quote.update({ where: { id: existing.id }, data: { ...job, lines: { create: lines } } }),
      db.activity.create({ data: { quoteId: existing.id, actor: 'operator', type: 'quote.redrafted', message } }),
    ]);
    quoteId = existing.id;
  } else {
    const quote = await withNumber('quote', (number) =>
      db.quote.create({
        data: {
          number,
          requestId,
          customerId,
          state: 'draft',
          depositPercent,
          ...job,
          lines: { create: lines },
          activities: { create: { actor: 'operator', type: 'quote.drafted', message } },
        },
      }),
    );
    quoteId = quote.id;
  }
  return summarise(quoteId, requestId, lines);
}

/** An empty draft for the operator to fill in by hand (the AI fallback). */
export async function draftQuoteManually(requestId: string): Promise<DraftOutcome> {
  const request = await db.incomingRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error('Request not found');
  const existing = await db.quote.findFirst({ where: { requestId }, orderBy: { createdAt: 'desc' }, include: { lines: true } });
  if (existing) return summarise(existing.id, requestId, existing.lines);

  const customerId = await resolveCustomer(request, null);
  await db.incomingRequest.update({ where: { id: requestId }, data: { status: 'drafted', customerId } });
  const quote = await withNumber('quote', (number) =>
    db.quote.create({
      data: {
        number,
        requestId,
        customerId,
        title: request.subject ?? 'New job',
        state: 'draft',
        depositDueDate: dayToDate(defaultDepositDueDate(null, new Date())),
        activities: { create: { actor: 'operator', type: 'quote.drafted', message: `Quote started manually from ${request.number}` } },
      },
    }),
  );
  return summarise(quote.id, requestId, []);
}

function summarise(quoteId: string, requestId: string, lines: { unitPriceCents: number | null }[]): DraftOutcome {
  const needsPrice = lines.filter((l) => l.unitPriceCents === null).length;
  return { quoteId, requestId, lines: lines.length, needsPrice, matched: lines.length - needsPrice };
}

// --- Saving edits ------------------------------------------------------------------

export class DraftError extends Error {}

/**
 * Replaces a draft's editable fields and lines with the operator's version. Line matches and
 * totals are recomputed here from the price list; the client's opinion of them is ignored.
 */
export async function saveDraft(quoteId: string, draft: DraftInput) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { state: true, customerId: true } });
  if (!quote) throw new DraftError('Quote not found');
  if (quote.state !== 'draft') throw new DraftError('This quote is already approved and can no longer be edited.');

  // Structural checks only: a draft may be incomplete while it is being edited.
  const { lineErrors, fieldErrors } = validateDraft(draft, '0000-00-00');
  if (fieldErrors.depositPercent) throw new DraftError(fieldErrors.depositPercent);
  for (const day of [draft.jobStartDate, draft.jobEndDate, draft.depositDueDate]) {
    if (day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))) throw new DraftError('Invalid date');
  }
  for (const [, e] of Object.entries(lineErrors)) {
    if (e.quantity || (e.unitPrice && e.unitPrice !== 'A unit price is required')) throw new DraftError(e.quantity ?? e.unitPrice);
  }

  const listItemIds = draft.lines.map((l) => l.priceListItemId).filter((id): id is string => Boolean(id));
  const listItems = new Map(
    (await db.priceListItem.findMany({ where: { id: { in: listItemIds } } })).map((p) => [p.id, p.priceCents]),
  );
  const lines = draft.lines.map((l, i) => {
    const priceListItemId = l.priceListItemId && listItems.has(l.priceListItemId) ? l.priceListItemId : null;
    return {
      id: l.id,
      position: i + 1,
      description: l.description.trim().slice(0, 300),
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      priceListItemId,
      match: lineMatch({ unitPriceCents: l.unitPriceCents, priceListItemId }, priceListItemId ? listItems.get(priceListItemId) : undefined),
      sourceText: l.sourceText,
    };
  });
  const totals = draftTotals({ lines, depositPercent: draft.depositPercent });

  await db.$transaction([
    db.customer.update({
      where: { id: quote.customerId },
      data: {
        company: draft.customer.company.trim(),
        contactName: draft.customer.contactName.trim() || null,
        email: draft.customer.email.trim().toLowerCase(),
      },
    }),
    db.quoteLine.deleteMany({ where: { quoteId } }),
    db.quote.update({
      where: { id: quoteId },
      data: {
        title: draft.title.trim() || 'New job',
        location: draft.location.trim() || null,
        jobStartDate: dayToDate(draft.jobStartDate),
        jobEndDate: dayToDate(draft.jobEndDate ?? draft.jobStartDate),
        depositPercent: draft.depositPercent,
        depositDueDate: dayToDate(draft.depositDueDate),
        ...totals,
        lines: { create: lines },
      },
    }),
  ]);
  return totals;
}
