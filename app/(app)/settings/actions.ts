'use server';

// Settings actions. Single-operator app with no login (see ../actions.ts); inputs are validated in lib/settings.ts.

import { revalidatePath } from 'next/cache';
import type { ReminderRuleKey } from '@prisma/client';
import { db } from '@/lib/db';
import { verifyConnection } from '@/lib/paypal';
import { savePriceList, saveReminderRules, SettingsError, type PriceListRow } from '@/lib/settings';

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; rows?: Record<string, string> };

export async function savePriceListAction(rows: PriceListRow[]): Promise<Result<{ changed: number }>> {
  if (!Array.isArray(rows) || rows.length > 500) return { ok: false, error: 'Invalid price list' };
  const clean = rows.map((r) => ({
    id: typeof r?.id === 'string' ? r.id : null,
    key: String(r?.key ?? ''),
    name: String(r?.name ?? '').slice(0, 200),
    unit: String(r?.unit ?? '').slice(0, 60),
    priceCents: typeof r?.priceCents === 'number' ? r.priceCents : null,
  }));
  try {
    const changed = await savePriceList(clean);
    revalidatePath('/settings');
    return { ok: true, data: { changed } };
  } catch (err) {
    if (err instanceof SettingsError) return { ok: false, error: err.message, rows: err.rows };
    console.error('[quotely] save price list failed:', err);
    return { ok: false, error: 'Couldn’t save the price list. Nothing was changed.' };
  }
}

export async function verifyPayPalAction(): Promise<Result<{ verifiedAt: string }>> {
  try {
    await verifyConnection();
    const verifiedAt = new Date().toISOString();
    await db.appSetting.upsert({
      where: { key: 'paypal.lastVerifiedAt' },
      create: { key: 'paypal.lastVerifiedAt', value: verifiedAt },
      update: { value: verifiedAt },
    });
    return { ok: true, data: { verifiedAt } };
  } catch (err) {
    // Log the PayPal error server-side only; the browser never sees credentials or raw errors.
    console.error('[quotely] PayPal connection check failed:', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Connection check failed. Invoices can’t be sent until PayPal is connected.' };
  }
}

export async function saveReminderRulesAction(rules: { key: ReminderRuleKey; enabled: boolean; offsetDays: number }[]): Promise<Result> {
  if (!Array.isArray(rules)) return { ok: false, error: 'Invalid rules' };
  try {
    await saveReminderRules(rules.map((r) => ({ key: r.key, enabled: Boolean(r.enabled), offsetDays: Number(r.offsetDays) })));
    revalidatePath('/settings');
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof SettingsError) return { ok: false, error: err.message };
    console.error('[quotely] save reminder rules failed:', err);
    return { ok: false, error: 'Couldn’t save the reminder rules.' };
  }
}
