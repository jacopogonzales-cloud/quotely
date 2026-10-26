import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Card, Label, PageHeader } from '@/components/ui';
import { db } from '@/lib/db';
import { isoDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Dashboard' };

// Placeholder until the AG Studio dashboard (milestone 5): the four headline numbers, from Quotely data.
export default async function DashboardPage() {
  await connection();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const invoices = await db.invoice.findMany({ select: { kind: true, status: true, amountCents: true, paidCents: true, dueDate: true, paidAt: true } });

  const open = invoices.filter((i) => i.status === 'sent');
  const outstanding = open.reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const overdue = open.filter((i) => isoDay(i.dueDate) < isoDay(now)).reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const paidThisMonth = invoices.filter((i) => i.status === 'paid' && i.paidAt && i.paidAt >= monthStart);
  const deposits = paidThisMonth.filter((i) => i.kind === 'deposit').reduce((s, i) => s + i.amountCents, 0);
  const collected = paidThisMonth.reduce((s, i) => s + i.amountCents, 0);

  const kpis = [
    { label: 'Outstanding now', value: outstanding, caption: 'As of now', tone: 'text-fg' },
    { label: 'Overdue now', value: overdue, caption: 'As of now', tone: 'text-state-overdue' },
    { label: 'Deposits secured', value: deposits, caption: 'This month', tone: 'text-state-deposit-paid' },
    { label: 'Collected this month', value: collected, caption: 'This month', tone: 'text-accent' },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader title="Money, moving." subtitle="Your quote-to-cash overview" />
      <div className="grid grid-cols-4 gap-4 px-6">
        {kpis.map((k) => (
          <Card key={k.label} className="flex h-32 flex-col justify-between p-5">
            <Label>{k.label}</Label>
            <div className={`font-mono text-[24px] leading-[30px] font-semibold ${k.tone}`}>{formatMoney(k.value)}</div>
            <div className="text-[11px] font-[550] text-fg-3">{k.caption}</div>
          </Card>
        ))}
      </div>
      <p className="px-6 pt-6 text-[13px] text-fg-3">The AG Studio cash-flow canvas arrives in milestone 5.</p>
    </div>
  );
}
