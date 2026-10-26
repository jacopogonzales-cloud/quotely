import { QuotesIcon } from '@/components/icons';
import { ButtonLink, EmptyState } from '@/components/ui';

export default function QuoteNotFound() {
  return (
    <EmptyState
      className="flex-1"
      icon={<QuotesIcon />}
      title="This quote doesn’t exist."
      body="It may have been removed when the demo data was reset."
      action={
        <ButtonLink href="/quotes" variant="primary">
          All quotes
        </ButtonLink>
      }
    />
  );
}
