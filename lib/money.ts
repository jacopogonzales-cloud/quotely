// Money is integer cents, EUR only. Formatting lives here so every screen shows amounts the same way.

export const CURRENCY = 'EUR';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2 });
const eurWhole = new Intl.NumberFormat('en-IE', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });

/** 84000 -> "€840.00" */
export const formatMoney = (cents: number) => eur.format(cents / 100);

/** 84000 -> "€840" (KPIs and compact labels only; invoices always show two decimals) */
export const formatMoneyShort = (cents: number) => eurWhole.format(cents / 100);

/** 84000 -> "840.00", the decimal string PayPal expects. */
export const centsToDecimal = (cents: number) => (cents / 100).toFixed(2);

/** "840.00" / "840,5" / "€ 840" -> 84000, or null if it isn't a non-negative amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[€\s]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Splits a total into deposit and balance; rounding goes to the deposit so the two always sum to the total. */
export function splitDeposit(totalCents: number, depositPercent: number) {
  const depositCents = Math.round((totalCents * depositPercent) / 100);
  return { depositCents, balanceCents: totalCents - depositCents };
}
