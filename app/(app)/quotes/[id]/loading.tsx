import { LoadingPage, SkeletonRows } from '@/components/page-states';
import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <LoadingPage title="Quote" message="Loading payment history…">
      <div className="flex w-full max-w-[736px] flex-col gap-5">
        <Skeleton className="h-[60px] rounded-card" />
        <Skeleton className="h-[88px] rounded-card" />
        <SkeletonRows count={5} className="h-[48px]" />
      </div>
      <div className="flex w-[404px] shrink-0 flex-col gap-5">
        <Skeleton className="h-[180px] rounded-card" />
        <Skeleton className="h-[160px] rounded-card" />
      </div>
    </LoadingPage>
  );
}
