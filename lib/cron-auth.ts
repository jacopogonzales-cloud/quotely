import { timingSafeEqual } from 'node:crypto';

// Shared-secret check for the scheduler routes (/api/paypal/reconcile, /api/agent/nudge): the
// caller sends `x-quotely-cron: <QUOTELY_CRON_SECRET>`. Without a configured secret the routes are
// open in development only. The app's own pages never call these routes; they use server actions,
// so the secret never reaches the browser.

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.QUOTELY_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const given = request.headers.get('x-quotely-cron') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unauthorized = () => Response.json({ error: 'Missing or wrong x-quotely-cron header' }, { status: 401 });
