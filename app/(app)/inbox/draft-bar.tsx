'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertIcon, CheckIcon, SparkIcon } from '@/components/icons';
import type { QuoteState } from '@prisma/client';
import { Button, ButtonLink, StatePill } from '@/components/ui';
import { draftManuallyAction, draftWithAiAction } from '../actions';

// The sticky action bar under a request: draft the quote with AI, with every outcome the design
// calls for (loading, ready, partial match, failure with a manual fallback).

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; requestId: string }
  | { kind: 'partial'; requestId: string; matched: number; needsPrice: number }
  | { kind: 'error'; notConfigured: boolean }
  | { kind: 'manual' };

const builderUrl = (requestId: string) => `/quotes/new?request=${requestId}`;

type ExistingQuote = { number: string; state: QuoteState; href: string };

// The page refreshes when a draft is created (the action revalidates /inbox), so this one component
// renders both "no quote yet" and "quote exists"; its status survives that refresh.
export function DraftBar({ requestId, quote }: { requestId: string; quote: ExistingQuote | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const draft = async () => {
    setStatus({ kind: 'loading' });
    const result = await draftWithAiAction(requestId);
    if (!result.ok) {
      setStatus({ kind: 'error', notConfigured: result.error === 'not_configured' });
      return;
    }
    const { matched, needsPrice } = result.data;
    if (needsPrice > 0) {
      setStatus({ kind: 'partial', requestId, matched, needsPrice });
    } else {
      setStatus({ kind: 'ready', requestId });
      // Let "Draft ready" register before moving on.
      setTimeout(() => router.push(builderUrl(requestId)), 700);
    }
  };

  const manual = async () => {
    setStatus({ kind: 'manual' });
    const result = await draftManuallyAction(requestId);
    if (result.ok) router.push(builderUrl(requestId));
    else setStatus({ kind: 'error', notConfigured: false });
  };

  return (
    <div className="sticky bottom-0 flex min-h-[72px] items-center justify-between gap-4 border-t border-line bg-surface-1 px-6 py-4" aria-live="polite">
      {status.kind === 'idle' && quote && (
        <>
          <span className="flex items-center gap-3 text-[13px] text-fg-3">
            Quote <span className="font-mono text-fg">{quote.number}</span> <StatePill state={quote.state} />
          </span>
          <ButtonLink href={quote.href} variant={quote.state === 'draft' ? 'primary' : 'secondary'}>
            {quote.state === 'draft' ? 'Review quote' : `Open quote ${quote.number}`}
          </ButtonLink>
        </>
      )}
      {status.kind === 'idle' && !quote && (
        <>
          <span className="text-[13px] text-fg-3">AI drafts the quote from your price list. It never invents a price.</span>
          <Button variant="primary" onClick={draft}>
            <SparkIcon /> Draft quote with AI
          </Button>
        </>
      )}
      {(status.kind === 'loading' || status.kind === 'manual') && (
        <>
          <span className="flex items-center gap-3 text-fg-2">
            <span className="size-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden />
            {status.kind === 'loading' ? 'Reading the request and matching your price list…' : 'Creating an empty quote…'}
          </span>
          <Button variant="primary" disabled>
            <SparkIcon /> Drafting…
          </Button>
        </>
      )}
      {status.kind === 'ready' && (
        <span className="flex items-center gap-2 font-[650] text-accent">
          <CheckIcon /> Draft ready to review
        </span>
      )}
      {status.kind === 'partial' && (
        <>
          <span className="flex items-center gap-2 font-[650] text-state-deposit-due">
            <AlertIcon />
            {status.matched} {status.matched === 1 ? 'item' : 'items'} matched. {status.needsPrice}{' '}
            {status.needsPrice === 1 ? 'needs' : 'need'} a price.
          </span>
          <ButtonLink href={builderUrl(status.requestId)} variant="primary">
            Review quote
          </ButtonLink>
        </>
      )}
      {status.kind === 'error' && (
        <>
          <span className="flex items-center gap-2 text-danger">
            <AlertIcon />
            {status.notConfigured
              ? 'AI drafting is off: no OpenAI key is configured. Your original message is safe.'
              : 'We couldn’t read this request. Your original message is safe.'}
          </span>
          <span className="flex gap-3">
            {!status.notConfigured && <Button onClick={draft}>Try again</Button>}
            <Button variant="primary" onClick={manual}>
              Create manually
            </Button>
          </span>
        </>
      )}
    </div>
  );
}
