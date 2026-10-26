import { LoadingPage, SkeletonRows } from '@/components/page-states';

export default function Loading() {
  return (
    <LoadingPage title="Quotes & jobs" message="Loading quotes…">
      <div className="flex-1">
        <SkeletonRows count={8} />
      </div>
    </LoadingPage>
  );
}
