'use client';

import { useEffect } from 'react';
import { AlertIcon } from '@/components/icons';
import { Button, ButtonLink, EmptyState } from '@/components/ui';

// Any page in the app that fails to render. Nothing here touches money: invoices and payments are
// only changed by explicit actions and by PayPal, so retrying is always safe.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[quotely] page error:', error);
  }, [error]);

  return (
    <EmptyState
      className="flex-1"
      icon={<AlertIcon className="text-danger" />}
      title="This page couldn’t load."
      body="Your quotes, invoices and payments are unchanged. Try again, or go back to the dashboard."
      action={
        <div className="flex gap-3">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/dashboard">Dashboard</ButtonLink>
        </div>
      }
    />
  );
}
