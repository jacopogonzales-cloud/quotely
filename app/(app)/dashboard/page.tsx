import type { Metadata } from 'next';
import { connection } from 'next/server';
import { aiEnabled, aiModels } from '@/lib/ai';
import { getCashflowData } from '@/lib/cashflow';
import { Dashboard } from './dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

// AG Studio draws charts on canvas, which needs the real font family names; next/font hashes
// them. These are the same two Google Fonts the rest of the app uses.
const STUDIO_FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Manrope:wght@400..800&display=swap';

export default async function DashboardPage() {
  await connection();
  const data = await getCashflowData();

  // Only the model ids and whether PayPal is configured reach the client; keys stay on the server.
  return (
    <>
      <link rel="stylesheet" href={STUDIO_FONTS} precedence="default" />
      <Dashboard
        data={data}
        licenseKey={process.env.AG_STUDIO}
        aiModels={aiEnabled() ? aiModels() : undefined}
        paypalConfigured={Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET)}
      />
    </>
  );
}
