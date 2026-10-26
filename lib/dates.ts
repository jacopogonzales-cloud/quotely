// Dates are stored as UTC instants and shown in the business's time zone.

export const TIME_ZONE = 'Europe/Rome';
export const DAY_MS = 86_400_000;

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

const toDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d);

/** "12 Nov" */
export const formatDay = (d: Date | string) => dayFmt.format(toDate(d));
/** "12 Nov 2026" */
export const formatDate = (d: Date | string) => dateFmt.format(toDate(d));
/** "29 Oct, 09:00" */
export const formatDateTime = (d: Date | string) => `${dayFmt.format(toDate(d))}, ${timeFmt.format(toDate(d))}`;
/** "2026-10-29": the calendar day in the business time zone. */
export const isoDay = (d: Date | string) => isoDayFmt.format(toDate(d));

/** "12–14 Nov" or "12 Nov" */
export function formatDateRange(start?: Date | string | null, end?: Date | string | null) {
  if (!start) return '—';
  if (!end || isoDay(start) === isoDay(end)) return formatDay(start);
  const s = toDate(start);
  const e = toDate(end);
  const sameMonth = s.toLocaleString('en-GB', { timeZone: TIME_ZONE, month: 'short' }) ===
    e.toLocaleString('en-GB', { timeZone: TIME_ZONE, month: 'short' });
  return sameMonth
    ? `${s.toLocaleString('en-GB', { timeZone: TIME_ZONE, day: 'numeric' })}–${formatDay(e)}`
    : `${formatDay(s)} – ${formatDay(e)}`;
}

/** "3 min ago", "2 h ago", "yesterday", "12 Oct" */
export function formatRelative(d: Date | string, now = new Date()) {
  const diff = now.getTime() - toDate(d).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return 'yesterday';
  return formatDay(d);
}

/** Whole calendar days from `a` to `b` in the business time zone (positive when b is later). */
export const daysBetween = (a: Date | string, b: Date | string) =>
  Math.round((Date.parse(isoDay(b)) - Date.parse(isoDay(a))) / DAY_MS);
