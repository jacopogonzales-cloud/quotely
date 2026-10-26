'use client';

import { useState, useTransition } from 'react';
import { AlertIcon, CheckIcon } from '@/components/icons';
import { Badge, Button, Card, Label } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { verifyPayPalAction } from './actions';

export function PayPalCard({
  configured,
  maskedClientId,
  lastVerifiedAt,
  webhookConfigured,
}: {
  configured: boolean;
  maskedClientId: string | null;
  lastVerifiedAt: string | null;
  webhookConfigured: boolean;
}) {
  const [verifiedAt, setVerifiedAt] = useState(lastVerifiedAt);
  const [error, setError] = useState<string | null>(configured ? null : 'Connection check failed. Invoices can’t be sent until PayPal is connected.');
  const [pending, startTransition] = useTransition();

  const verify = () =>
    startTransition(async () => {
      const result = await verifyPayPalAction();
      if (result.ok) {
        setVerifiedAt(result.data.verifiedAt);
        setError(null);
      } else setError(result.error);
    });

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${error ? 'bg-danger' : 'bg-state-deposit-paid'}`} aria-hidden />
              <h2 className="text-[20px] leading-7 font-bold">{error ? 'PayPal not connected' : 'Connected to PayPal'}</h2>
              <Badge>Sandbox</Badge>
            </div>
            <p className="mt-1 text-[13px] text-fg-2">Deposit and balance invoices are created and sent through the PayPal Invoicing API.</p>
          </div>
          <Button onClick={verify} disabled={pending || !configured}>
            {pending ? 'Checking…' : 'Verify connection'}
          </Button>
        </div>

        <dl className="mt-5 grid grid-cols-[160px_1fr] gap-y-3 text-[13px]">
          <dt className="text-fg-3">Environment</dt>
          <dd className="text-fg">Sandbox (api-m.sandbox.paypal.com)</dd>
          <dt className="text-fg-3">REST app</dt>
          <dd className="font-mono text-fg">{maskedClientId ?? 'Not configured'}</dd>
          <dt className="text-fg-3">Last verified</dt>
          <dd className="font-mono text-fg">{verifiedAt ? formatDateTime(verifiedAt) : 'Never'}</dd>
          <dt className="text-fg-3">Payment webhook</dt>
          <dd className="text-fg">
            {webhookConfigured ? 'Signature verification on' : 'Not registered: payments are detected by polling every 30 s'}
          </dd>
        </dl>

        {error && (
          <p role="alert" className="mt-5 flex items-center gap-2 rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
            <AlertIcon className="size-4 shrink-0" /> {error}
          </p>
        )}
        {!error && verifiedAt && !pending && (
          <p className="mt-5 flex items-center gap-2 text-[13px] text-fg-2">
            <CheckIcon className="size-4 text-state-deposit-paid" /> PayPal accepted the app’s credentials.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <Label>Credentials</Label>
        <p className="mt-1 text-[13px] text-fg-2">
          Credentials live only in the server environment (<code className="font-mono">PAYPAL_CLIENT_ID</code>, <code className="font-mono">PAYPAL_SECRET</code>,{' '}
          <code className="font-mono">PAYPAL_WEBHOOK_ID</code>) and are never shown or sent to the browser. See docs/paypal-sandbox-testing.md to register the webhook.
        </p>
      </Card>
    </div>
  );
}
