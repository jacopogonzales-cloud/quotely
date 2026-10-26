import { reconcileOpenInvoices } from '@/lib/billing';
import { cronAuthorized, unauthorized } from '@/lib/cron-auth';

// POST /api/paypal/reconcile: re-reads every open live invoice from PayPal and records payments.
// For external schedulers (header x-quotely-cron). The open pages poll the same function through
// a server action every 30 seconds (app/(app)/payment-actions.ts).
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const result = await reconcileOpenInvoices();
  return Response.json(result);
}
