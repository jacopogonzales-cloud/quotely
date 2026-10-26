import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { InboxIcon, MailIcon, PlusIcon, SparkIcon } from '@/components/icons';
import { Badge, Button, ButtonLink, Card, EmptyState, Label, PageHeader, StatePill, cx } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/dates';
import { listRequests, type InboxRequest } from '@/lib/queries';

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
        actions={
          <Button variant="primary" disabled title="Arrives with the AI quote builder (milestone 2)">
            <PlusIcon /> New request
          </Button>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<InboxIcon />}
          title="Your next job starts here."
          body="Paste a customer email to turn it into a structured quote."
          action={
            <Button variant="primary" disabled>
              Paste a request
            </Button>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
          <RequestList requests={requests} selectedId={selected.id} />
          <RequestDetail request={selected} />
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
                  <span className="truncate font-[650] text-fg">{r.fromCompany ?? r.fromName ?? r.fromEmail}</span>
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
            <h2 className="text-[20px] leading-7 font-bold text-fg">{r.fromCompany ?? r.fromName}</h2>
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

        {quote && (
          <div className="mt-6 flex items-center gap-3">
            <Label>Quote</Label>
            <Link href={`/quotes/${quote.id}`} className="font-mono text-[13px] text-fg underline-offset-4 hover:underline">
              {quote.number}
            </Link>
            <StatePill state={quote.state} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-line bg-surface-1 px-6 py-4">
        <span className="text-[13px] text-fg-3">
          {quote ? 'A quote already exists for this request.' : 'AI drafts the quote from your price list. It never invents a price.'}
        </span>
        {quote ? (
          <ButtonLink href={`/quotes/${quote.id}`} variant="secondary">
            Open quote {quote.number}
          </ButtonLink>
        ) : (
          <Button variant="primary" disabled title="Arrives in milestone 2">
            <SparkIcon /> Draft quote with AI
          </Button>
        )}
      </div>
    </Card>
  );
}
