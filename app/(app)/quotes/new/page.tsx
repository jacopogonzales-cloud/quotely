import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { isoDay } from '@/lib/dates';
import type { Extraction } from '@/lib/ai/extract';
import type { DraftInput } from '@/lib/quote-draft';
import { AutoDraft } from './auto-draft';
import { QuoteBuilder } from './quote-builder';

export const metadata: Metadata = { title: 'New quote' };

const day = (d: Date | null) => (d ? isoDay(d) : null);

export default async function NewQuotePage({ searchParams }: PageProps<'/quotes/new'>) {
  await connection();
  const { request: requestId } = await searchParams;
  if (typeof requestId !== 'string') redirect('/inbox');

  const request = await db.incomingRequest.findUnique({ where: { id: requestId } });
  if (!request) notFound();
  const [quote, priceList] = await Promise.all([
    db.quote.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
      include: { customer: true, lines: { orderBy: { position: 'asc' } }, activities: { where: { type: 'quote.redrafted' }, select: { id: true } } },
    }),
    db.priceListItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ]);

  // Opened straight from a link before any draft exists: draft it now.
  if (!quote) return <AutoDraft requestId={request.id} requestNumber={request.number} priceListCount={priceList.length} />;
  if (quote.state !== 'draft') redirect(`/quotes/${quote.id}`);

  const extraction = request.extraction ? (JSON.parse(request.extraction) as Extraction) : null;
  const draft: DraftInput = {
    title: quote.title,
    location: quote.location ?? '',
    jobStartDate: day(quote.jobStartDate),
    jobEndDate: day(quote.jobEndDate),
    depositPercent: quote.depositPercent,
    depositDueDate: day(quote.depositDueDate),
    customer: {
      company: quote.customer.company,
      contactName: quote.customer.contactName ?? '',
      email: quote.customer.email,
    },
    lines: quote.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      priceListItemId: l.priceListItemId,
      sourceText: l.sourceText,
    })),
  };

  return (
    <QuoteBuilder
      // A redraft replaces every line: start the editor afresh.
      key={`${quote.id}:${quote.activities.length}`}
      quoteId={quote.id}
      quoteNumber={quote.number}
      request={{ id: request.id, number: request.number, body: request.body, subject: request.subject }}
      initialDraft={draft}
      facts={extraction?.facts ?? []}
      notes={extraction?.notes ?? []}
      aiDrafted={extraction !== null}
      priceList={priceList.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, priceCents: p.priceCents }))}
      today={isoDay(new Date())}
    />
  );
}
