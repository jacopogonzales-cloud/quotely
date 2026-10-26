import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/ui';
import { SettingsIcon } from '@/components/icons';

export const metadata: Metadata = { title: 'Settings' };

// Placeholder until milestone 4 (price list, PayPal connection, reminder rules).
export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Settings" />
      <EmptyState
        className="flex-1"
        icon={<SettingsIcon />}
        title="Settings arrive in milestone 4."
        body="Price list, PayPal connection and reminder rules."
      />
    </div>
  );
}
