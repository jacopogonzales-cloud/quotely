import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { PageHeader, cx } from '@/components/ui';
import { db } from '@/lib/db';
import { PayPalCard } from './paypal-card';
import { PriceListEditor } from './price-list-editor';
import { ReminderRules } from './reminder-rules';

export const metadata: Metadata = { title: 'Settings' };

const TABS = [
  { key: 'price-list', label: 'Price list' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'reminders', label: 'Reminder rules' },
] as const;

/** "AXXX…7Hq2": enough to recognise the app, never the whole credential. */
const mask = (id: string | undefined) => (id && id.length > 10 ? `${id.slice(0, 4)}••••••••${id.slice(-4)}` : null);

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  await connection();
  const { tab: requested } = await searchParams;
  const tab = TABS.find((t) => t.key === requested)?.key ?? 'price-list';

  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" subtitle="Prices, PayPal and the reminder agent." />
      <div className="flex gap-6 px-6 pb-10">
        <nav aria-label="Settings" className="flex w-[220px] shrink-0 flex-col gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/settings?tab=${t.key}`}
              aria-current={t.key === tab ? 'page' : undefined}
              className={cx(
                'flex h-11 items-center rounded-control px-3 font-[650] transition-colors duration-[120ms]',
                t.key === tab ? 'bg-accent-subtle text-accent' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="w-[920px] min-w-0">
          {tab === 'price-list' && <PriceListTab />}
          {tab === 'paypal' && <PayPalTab />}
          {tab === 'reminders' && <RemindersTab />}
        </div>
      </div>
    </div>
  );
}

async function PriceListTab() {
  const items = await db.priceListItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  return (
    <PriceListEditor
      items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, priceCents: i.priceCents, currency: i.currency, updatedAt: i.updatedAt.toISOString() }))}
    />
  );
}

async function PayPalTab() {
  const lastVerified = await db.appSetting.findUnique({ where: { key: 'paypal.lastVerifiedAt' } });
  return (
    <PayPalCard
      configured={Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET)}
      maskedClientId={mask(process.env.PAYPAL_CLIENT_ID)}
      lastVerifiedAt={lastVerified?.value ?? null}
      webhookConfigured={Boolean(process.env.PAYPAL_WEBHOOK_ID)}
    />
  );
}

async function RemindersTab() {
  const [rules, lastRun] = await Promise.all([
    db.reminderRule.findMany(),
    db.appSetting.findUnique({ where: { key: 'agent.lastRun' } }),
  ]);
  const get = (key: 'deposit_unpaid' | 'balance_overdue', fallback: number) => {
    const r = rules.find((x) => x.key === key);
    return { key, enabled: r?.enabled ?? true, offsetDays: r?.offsetDays ?? fallback };
  };
  return (
    <ReminderRules
      rules={[get('deposit_unpaid', -2), get('balance_overdue', 1)]}
      lastRun={lastRun ? (JSON.parse(lastRun.value) as { ranAt: string; sent: number; scheduled: number; skipped: number; failed: number }) : null}
    />
  );
}
