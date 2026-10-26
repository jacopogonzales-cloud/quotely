import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeftIcon } from '@/components/icons';
import { Badge, Card, CardTitle, Label, OverduePill, StatePill, cx } from '@/components/ui';
import { formatDate, formatDateRange, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { getQuote } from '@/lib/queries';
import { daysOverdue } from '@/lib/quote-state';

export const metadata: Metadata = { title: 'Quote' };

// Read-only quote view for milestone 1. Milestone 3 replaces it with the full detail page
// (stage rail, timeline, PayPal invoices, state-dependent primary action).
export default async function QuotePage({ params }: PageProps<'/quotes/[id]'>) {
  await connection();
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();
  const late = daysOverdue(quote);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <Link href="/quotes" className="inline-flex w-fit items-center gap-1 text-[13px] font-[650] text-fg-2 hover:text-fg">
        <ChevronLeftIcon className="size-4" /> Quotes & jobs
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-fg-3">{quote.number}</span>
            <StatePill state={quote.state} />
            {late > 0 && <OverduePill days={late} />}
          </div>
          <h1 className="mt-1 text-[26px] leading-[34px] font-[750] text-fg">{quote.customer.company}</h1>
          <p className="text-fg-2">
            {quote.title} · {formatDateRange(quote.jobStartDate, quote.jobEndDate)}
            {quote.location ? ` · ${quote.location}` : ''}
          </p>
        </div>
        <div className="text-right">
          <Label>Total</Label>
          <div className="font-mono text-[24px] leading-[30px] font-semibold text-fg">{formatMoney(quote.totalCents)}</div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,736px)_404px] gap-5">
        <Card className="p-5">
          <CardTitle>Line items</CardTitle>
          <table className="mt-4 w-full text-left text-[13px]">
            <thead className="text-[12px] text-fg-3">
              <tr className="h-9">
                <th className="font-[650]">Item</th>
                <th className="text-right font-[650]">Qty</th>
                <th className="text-right font-[650]">Unit price</th>
                <th className="text-right font-[650]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="h-11 border-t border-line">
                  <td className="text-fg">
                    {l.description}
                    {l.match === 'needs_price' && <Badge className="ml-2 border-state-deposit-due/40 text-state-deposit-due">Needs a price</Badge>}
                  </td>
                  <td className="text-right font-mono text-fg-2">{l.quantity}</td>
                  <td className="text-right font-mono text-fg-2">{l.unitPriceCents === null ? '—' : formatMoney(l.unitPriceCents)}</td>
                  <td className="text-right font-mono text-fg">{l.unitPriceCents === null ? '—' : formatMoney(l.unitPriceCents * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <CardTitle>Invoices</CardTitle>
            {quote.invoices.length === 0 ? (
              <p className="mt-3 text-fg-3">No invoices yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {quote.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-[650] capitalize text-fg">{i.kind}</div>
                      <div className="font-mono text-[12px] text-fg-3">
                        {i.number} · due {formatDate(i.dueDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-fg">{formatMoney(i.amountCents)}</div>
                      <div className={cx('text-[12px] font-[650]', i.status === 'paid' ? 'text-state-paid' : 'text-fg-3')}>{i.status}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <CardTitle>Activity</CardTitle>
            <ol className="mt-3 flex flex-col gap-3">
              {quote.activities.map((a) => (
                <li key={a.id} className="text-[13px]">
                  <div className="text-fg">{a.message}</div>
                  <div className="font-mono text-[11px] text-fg-3">
                    {formatDateTime(a.at)} · {a.actor}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
