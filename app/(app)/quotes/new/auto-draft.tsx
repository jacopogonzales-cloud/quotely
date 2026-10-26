'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertIcon } from '@/components/icons';
import { Button, ButtonLink, Card } from '@/components/ui';
import { draftManuallyAction, draftWithAiAction } from '../../actions';

// Shown when the builder is opened for a request that has no draft yet: drafts it, then reloads.
export function AutoDraft({ requestId, requestNumber, priceListCount }: { requestId: string; requestNumber: string; priceListCount: number }) {
  const router = useRouter();
  const [failed, setFailed] = useState<false | 'failed' | 'not_configured'>(false);
  const started = useRef(false);

  const run = async () => {
    setFailed(false);
    const result = await draftWithAiAction(requestId);
    if (result.ok) router.refresh();
    else setFailed(result.error === 'not_configured' ? 'not_configured' : 'failed');
  };

  useEffect(() => {
    // Strict mode mounts effects twice in development; draft once.
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manual = async () => {
    const result = await draftManuallyAction(requestId);
    if (result.ok) router.refresh();
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-[480px] p-8 text-center" aria-live="polite">
        {failed ? (
          <>
            <AlertIcon className="mx-auto size-8 text-danger" />
            <h1 className="mt-3 text-[20px] leading-7 font-bold">
              {failed === 'not_configured' ? 'AI drafting is off.' : 'We couldn’t read this request.'}
            </h1>
            <p className="mt-1 text-fg-2">
              {failed === 'not_configured' ? 'No OpenAI key is configured. ' : ''}Your original message is safe.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              {failed === 'failed' && <Button onClick={run}>Try again</Button>}
              <Button variant="primary" onClick={manual}>
                Create manually
              </Button>
            </div>
            <ButtonLink href={`/inbox?id=${requestId}`} variant="ghost" size="sm" className="mt-3">
              Back to {requestNumber}
            </ButtonLink>
          </>
        ) : (
          <>
            <span className="mx-auto block size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" aria-hidden />
            <h1 className="mt-4 text-[20px] leading-7 font-bold">Building your quote from {priceListCount} price-list items…</h1>
            <p className="mt-1 text-fg-2">Reading {requestNumber}. Prices come only from your price list.</p>
          </>
        )}
      </Card>
    </div>
  );
}
