'use client';

import { useState, useTransition } from 'react';
import { AlertIcon, CheckIcon, CloseIcon, PlusIcon } from '@/components/icons';
import { Button, Card, cx } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { centsToDecimal, parseMoney } from '@/lib/money';
import { savePriceListAction } from './actions';

type Item = { id: string; name: string; unit: string; priceCents: number; currency: string; updatedAt: string };
type Row = { key: string; id: string | null; name: string; unit: string; price: string; updatedAt: string | null };

const toRow = (i: Item): Row => ({ key: i.id, id: i.id, name: i.name, unit: i.unit, price: centsToDecimal(i.priceCents), updatedAt: i.updatedAt });

const CELL =
  'h-9 w-full rounded-[8px] border bg-transparent px-2 text-[13px] text-fg placeholder:text-fg-3 hover:border-line-strong hover:bg-surface-2 focus:border-focus focus:bg-surface-2 focus:outline-none';

export function PriceListEditor({ items }: { items: Item[] }) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const edit = (key: string, patch: Partial<Row>) => {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
    setErrors((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
  };
  const add = () => {
    setRows((all) => [...all, { key: crypto.randomUUID(), id: null, name: '', unit: 'per unit', price: '', updatedAt: null }]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((all) => all.filter((r) => r.key !== key));
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      // Client-side checks mirror the server's; the server decides.
      const local: Record<string, string> = {};
      for (const r of rows) {
        if (r.price.trim() && parseMoney(r.price) === null) local[r.key] = r.price.trim().startsWith('-') ? 'Prices can’t be negative' : 'Enter a valid price';
      }
      if (Object.keys(local).length) {
        setErrors(local);
        setMessage({ ok: false, text: 'Fix the highlighted rows, then save again.' });
        return;
      }
      const result = await savePriceListAction(
        rows.map((r) => ({ id: r.id, key: r.key, name: r.name, unit: r.unit, priceCents: r.price.trim() ? parseMoney(r.price) : null })),
      );
      if (!result.ok) {
        setErrors(result.rows ?? {});
        setMessage({ ok: false, text: result.error });
        return;
      }
      setErrors({});
      setDirty(false);
      setMessage({ ok: true, text: 'Price list updated. New drafts will use these prices.' });
    });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] leading-7 font-bold">Price list</h2>
          <p className="text-[13px] text-fg-2">The AI matches requests to these items. It never invents a price; anything not listed needs one from you.</p>
        </div>
        <Button size="sm" onClick={add}>
          <PlusIcon className="size-4" /> Add item
        </Button>
      </div>

      <table className="mt-4 w-full table-fixed border-collapse text-left">
        <colgroup>
          <col />
          <col className="w-[200px]" />
          <col className="w-[130px]" />
          <col className="w-[80px]" />
          <col className="w-[120px]" />
          <col className="w-10" />
        </colgroup>
        <thead className="bg-surface-2 text-[12px] text-fg-3">
          <tr className="h-10">
            <th className="rounded-l-[8px] px-3 font-[650]">Item</th>
            <th className="px-3 font-[650]">Unit</th>
            <th className="px-3 text-right font-[650]">Price</th>
            <th className="px-3 font-[650]">Currency</th>
            <th className="px-3 font-[650]">Last updated</th>
            <th className="rounded-r-[8px]">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const error = errors[r.key];
            const border = error ? 'border-danger' : 'border-transparent';
            return (
              <tr key={r.key} className="border-b border-line align-top">
                <td className="px-1 py-1.5">
                  <input aria-label="Item" value={r.name} onChange={(e) => edit(r.key, { name: e.target.value })} placeholder="Item name" className={cx(CELL, border)} />
                  {error && <div className="px-2 pt-1 text-[11px] text-danger">{error}</div>}
                </td>
                <td className="px-1 py-1.5">
                  <input aria-label="Unit" value={r.unit} onChange={(e) => edit(r.key, { unit: e.target.value })} className={cx(CELL, 'border-transparent')} />
                </td>
                <td className="px-1 py-1.5">
                  <input
                    aria-label="Price"
                    value={r.price}
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => edit(r.key, { price: e.target.value })}
                    className={cx(CELL, 'text-right font-mono', border)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex h-9 items-center font-mono text-[13px] text-fg-3">EUR</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex h-9 items-center font-mono text-[12px] text-fg-3">{r.updatedAt ? formatDate(r.updatedAt) : 'New'}</span>
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    aria-label={`Remove ${r.name || 'item'}`}
                    className="flex size-9 items-center justify-center rounded-[8px] text-fg-3 hover:bg-surface-3 hover:text-danger"
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-8 text-center text-fg-3">No items. Every request line will need a price from you.</p>}

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-[12px] text-fg-3">Removed items stay on existing quotes; new drafts stop using them.</p>
        <div className="flex items-center gap-4">
          {message && (
            <span role="status" className={cx('flex items-center gap-1.5 text-[13px] font-[650]', message.ok ? 'text-accent' : 'text-danger')}>
              {message.ok ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />} {message.text}
            </span>
          )}
          <Button variant="primary" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save prices'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
