import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { AlertIcon, CheckIcon, InboxIcon, MailIcon } from '@/components/icons';
import { Badge, Card, EmptyState, Label, PageHeader, cx } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/dates';
import { listRequests, type InboxRequest } from '@/lib/queries';
import { DraftBar } from './draft-bar';
import { NewRequestButton } from './new-request';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage({ searchParams }: PageProps<'/inbox'>) {
  await connection();
  const { id } = await searchParams;
  const requests = await listRequests();
  const selected = requests.find((r) => r.id === id) ?? requests[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Every request. One clear next step."
        actions={<NewRequestButton />}
      />

      {requests.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<InboxIcon />}
          title="Your next job starts here."
          body="Paste a customer email to turn it into a structured quote."
          action={<NewRequestButton label="Paste a request" />}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
          <RequestList requests={requests} selectedId={selected.id} />
          <RequestDetail key={selected.id} request={selected} />
        </div>
      )}
    </div>
  );
}

function RequestList({ requests, selectedId }: { requests: InboxRequest[]; selectedId: string }) {
  return (
    <Card className="flex w-[340px] shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Label>Requests</Label>
        <span className="font-mono text-[11px] text-fg-3">{requests.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {requests.map((r) => {
          const active = r.id === selectedId;
          const quote = r.quotes[0];
          return (
            <li key={r.id}>
              <Link
                href={`/inbox?id=${r.id}`}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={cx(
                  'flex min-h-20 flex-col gap-1 border-b border-l-[3px] border-b-line px-4 py-3 transition-colors duration-[120ms]',
                  active ? 'border-l-accent bg-surface-2' : 'border-l-transparent hover:bg-surface-3/60',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-[650] text-fg">{senderOf(r)}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-3">{formatRelative(r.receivedAt)}</span>
                </div>
                <span className="truncate text-[13px] text-fg-2">{r.subject ?? r.body.slice(0, 80)}</span>
                <span className="mt-0.5 flex items-center gap-2">
                  {quote ? (
                    <Badge>Quote {quote.number}</Badge>
                  ) : (
                    <Badge className="border-accent/30 bg-accent-subtle text-accent">New</Badge>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RequestDetail({ request: r }: { request: InboxRequest }) {
  const quote = r.quotes[0];
  return (
    <Card className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] leading-7 font-bold text-fg">{senderOf(r)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-2">
              {r.fromName && <span>{r.fromName}</span>}
              {r.fromEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <MailIcon className="size-4 text-fg-3" />
                  {r.fromEmail}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[13px] text-fg">{r.number}</div>
            <div className="font-mono text-[12px] text-fg-3">Received {formatDateTime(r.receivedAt)}</div>
          </div>
        </div>

        {r.subject && <h3 className="mt-6 text-[16px] leading-6 font-bold text-fg">{r.subject}</h3>}
        <div className="mt-3 max-w-[72ch] rounded-card border border-line bg-surface-2 p-5 whitespace-pre-wrap text-fg-2">
          {r.body}
        </div>

        {quote && <ExtractedFacts request={r} />}
      </div>

      <DraftBar requestId={r.id} quote={quote ? { number: quote.number, state: quote.state, href: quoteHref(r) } : null} />
    </Card>
  );
}

const senderOf = (r: InboxRequest) => r.fromCompany ?? r.fromName ?? r.fromEmail ?? 'Pasted request';

/** Drafts open in the builder; anything approved opens its detail page. */
const quoteHref = (r: InboxRequest) =>
  r.quotes[0].state === 'draft' ? `/quotes/new?request=${r.id}` : `/quotes/${r.quotes[0].id}`;

/** "3 price-list matches · Dates recognized", or what still needs attention. */
function ExtractedFacts({ request: r }: { request: InboxRequest }) {
  const lines = r.quotes[0].lines;
  const matched = lines.filter((l) => l.match === 'matched' || l.match === 'edited').length;
  const needsPrice = lines.filter((l) => l.match === 'needs_price').length;
  const facts = [
    { ok: matched > 0, text: `${matched} price-list ${matched === 1 ? 'match' : 'matches'}` },
    ...(needsPrice ? [{ ok: false, text: `${needsPrice} ${needsPrice === 1 ? 'needs' : 'need'} a price` }] : []),
    { ok: Boolean(r.quotes[0].jobStartDate), text: r.quotes[0].jobStartDate ? 'Dates recognized' : 'No dates found' },
  ];
  return (
    <div className="mt-6">
      <Label>Extracted facts</Label>
      <ul className="mt-2 flex flex-wrap gap-2">
        {facts.map((f) => (
          <li key={f.text}>
            <Badge className={f.ok ? 'text-fg' : 'border-state-deposit-due/40 text-state-deposit-due'}>
              {f.ok ? <CheckIcon className="size-3.5 text-accent" /> : <AlertIcon className="size-3.5" />}
              {f.text}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
