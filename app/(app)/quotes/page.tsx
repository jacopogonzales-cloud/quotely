import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageHeader } from '@/components/ui';
import { formatDateRange } from '@/lib/dates';
import { listQuotes } from '@/lib/queries';
import { daysOverdue, nextAction } from '@/lib/quote-state';
import { QuotesTable, type QuoteRow } from './quotes-table';

export const metadata: Metadata = { title: 'Quotes & jobs' };

export default async function QuotesPage() {
  await connection();
  const now = new Date();
  const quotes = await listQuotes();

  const rows: QuoteRow[] = quotes.map((q) => ({
    id: q.id,
    number: q.number,
    title: q.title,
    customer: q.customer.company,
    jobDate: formatDateRange(q.jobStartDate, q.jobEndDate),
    jobSort: q.jobStartDate?.toISOString() ?? '',
    totalCents: q.totalCents,
    state: q.state,
    daysOverdue: daysOverdue(q, now),
    nextAction: nextAction(q, now),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Quotes & jobs" subtitle="Every quote, where its money is, and what happens next." />
      <QuotesTable rows={rows} />
    </div>
  );
}
