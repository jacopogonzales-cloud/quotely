// Settings: the price list and the reminder rules. Server-only.

import { Prisma, type ReminderRuleKey } from '@prisma/client';
import { db } from './db';
import { MAX_UNIT_PRICE_CENTS } from './quote-draft';

export class SettingsError extends Error {
  constructor(
    message: string,
    /** Row-level messages keyed by row id, for the editor. */
    readonly rows: Record<string, string> = {},
  ) {
    super(message);
  }
}

// --- Price list --------------------------------------------------------------------------

export type PriceListRow = { id: string | null; key: string; name: string; unit: string; priceCents: number | null };

/** "NS-FOGMACH-K3"; unique, stable once created, never shown as a price. */
const skuFor = (name: string) =>
  `NS-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM'}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

/**
 * Replaces the active price list with `rows`. Rows without an id are new; active items missing
 * from `rows` are retired (kept for the quotes that use them, hidden from new drafts).
 */
export async function savePriceList(rows: PriceListRow[]) {
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) errors[r.key] = 'Enter an item name';
    else if (!r.unit.trim()) errors[r.key] = 'Enter a unit, e.g. "per event"';
    else if (r.priceCents === null || !Number.isInteger(r.priceCents)) errors[r.key] = 'Enter a price';
    else if (r.priceCents < 0) errors[r.key] = 'Prices can’t be negative';
    else if (r.priceCents > MAX_UNIT_PRICE_CENTS) errors[r.key] = 'That price is too high';
    const dupe = seen.get(name.toLowerCase());
    if (name && dupe) errors[r.key] = `Duplicate of another item named “${name}”`;
    seen.set(name.toLowerCase(), r.key);
  }
  if (Object.keys(errors).length) throw new SettingsError('Fix the highlighted rows, then save again.', errors);

  const current = await db.priceListItem.findMany({ where: { active: true } });
  const keep = new Set(rows.map((r) => r.id).filter(Boolean));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const item of current) {
    if (!keep.has(item.id)) ops.push(db.priceListItem.update({ where: { id: item.id }, data: { active: false } }));
  }
  for (const r of rows) {
    const data = { name: r.name.trim(), unit: r.unit.trim(), priceCents: r.priceCents! };
    const existing = r.id ? current.find((c) => c.id === r.id) : undefined;
    if (existing) {
      // Only touch rows that changed, so "Last updated" means something.
      if (existing.name !== data.name || existing.unit !== data.unit || existing.priceCents !== data.priceCents) {
        ops.push(db.priceListItem.update({ where: { id: existing.id }, data }));
      }
    } else {
      ops.push(db.priceListItem.create({ data: { ...data, sku: skuFor(data.name) } }));
    }
  }
  await db.$transaction(ops);
  return ops.length;
}

// --- Reminder rules ------------------------------------------------------------------------

export const OFFSET_LIMITS: Record<ReminderRuleKey, { min: number; max: number }> = {
  deposit_unpaid: { min: -14, max: 0 }, // 0 to 14 days before the due date
  balance_overdue: { min: 1, max: 30 }, // 1 to 30 days after the due date
};

export async function saveReminderRules(rules: { key: ReminderRuleKey; enabled: boolean; offsetDays: number }[]) {
  for (const r of rules) {
    const limits = OFFSET_LIMITS[r.key];
    if (!limits) throw new SettingsError('Unknown rule');
    if (!Number.isInteger(r.offsetDays) || r.offsetDays < limits.min || r.offsetDays > limits.max) {
      throw new SettingsError(
        r.key === 'deposit_unpaid' ? 'Deposit reminders go 0 to 14 days before the due date.' : 'Overdue reminders go 1 to 30 days after the due date.',
      );
    }
  }
  await db.$transaction(
    rules.map((r) =>
      db.reminderRule.upsert({
        where: { key: r.key },
        create: { key: r.key, enabled: Boolean(r.enabled), offsetDays: r.offsetDays },
        update: { enabled: Boolean(r.enabled), offsetDays: r.offsetDays },
      }),
    ),
  );
}
