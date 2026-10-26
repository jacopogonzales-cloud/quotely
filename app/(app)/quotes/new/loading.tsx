import { LoadingPage } from '@/components/page-states';
import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <LoadingPage title="New quote" message="Opening the quote builder…">
      <Skeleton className="w-[280px] shrink-0 rounded-card" />
      <Skeleton className="flex-1 rounded-card" />
      <Skeleton className="w-[324px] shrink-0 rounded-card" />
    </LoadingPage>
  );
}
