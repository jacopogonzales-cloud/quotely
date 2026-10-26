import { LoadingPage, SkeletonRows } from '@/components/page-states';

export default function Loading() {
  return (
    <LoadingPage title="Settings" message="Loading settings…">
      <div className="w-[220px] shrink-0">
        <SkeletonRows count={3} className="h-11" />
      </div>
      <div className="w-[920px]">
        <SkeletonRows count={8} className="h-11" />
      </div>
    </LoadingPage>
  );
}
