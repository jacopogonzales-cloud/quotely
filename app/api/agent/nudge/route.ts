import { runNudgeAgent } from '@/lib/agent/nudge';
import { cronAuthorized, unauthorized } from '@/lib/cron-auth';

// POST /api/agent/nudge: runs the reminder rules once (reconciling with PayPal first).
// For external schedulers (header x-quotely-cron). Open pages also run it from their
// 30-second payment timer (app/(app)/payment-actions.ts), so the demo needs no scheduler.
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  return Response.json(await runNudgeAgent());
}
