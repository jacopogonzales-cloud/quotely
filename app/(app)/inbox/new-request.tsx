'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Dialog } from '@/components/dialog';
import { PlusIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { addRequestAction } from '../actions';

export function NewRequestButton({ label = 'New request', variant = 'primary' }: { label?: string; variant?: 'primary' | 'secondary' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await addRequestAction(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setText('');
      router.push(`/inbox?id=${result.data.id}`);
    });

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon /> {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Paste customer request"
        width={640}
        dismissible={!pending}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending || text.trim().length === 0}>
              {pending ? 'Adding…' : 'Add to inbox'}
            </Button>
          </>
        }
      >
        <label htmlFor="request-text" className="text-[12px] font-[650] text-fg-3">
          The customer’s email or form message, as received
        </label>
        <textarea
          id="request-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          autoFocus
          placeholder={'Hi, we need 4 x 65-inch displays and delivery to Via Tortona 31, Milan, from 12 to 14 November…'}
          className="mt-2 w-full resize-y rounded-control border border-line bg-surface-2 p-3 text-fg placeholder:text-fg-3 hover:border-line-strong focus:border-focus focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
