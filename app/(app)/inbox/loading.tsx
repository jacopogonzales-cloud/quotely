import { LoadingPage, SkeletonRows } from '@/components/page-states';
import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <LoadingPage title="Every request. One clear next step." message="Loading your inbox…">
      <div className="w-[340px] shrink-0">
        <SkeletonRows count={6} className="h-[84px]" />
      </div>
      <Skeleton className="flex-1 rounded-card" />
    </LoadingPage>
  );
}
