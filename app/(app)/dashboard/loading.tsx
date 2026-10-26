import { Skeleton } from '@/components/ui';

// Mirrors the dashboard header and the Cash Flow report's first rows.
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <header className="flex h-[88px] shrink-0 items-center px-6">
        <div>
          <h1 className="text-[26px] leading-[34px] font-[750] tracking-[-0.01em] text-fg">Money, moving.</h1>
          <p className="text-fg-2" role="status">
            Your quote-to-cash overview
          </p>
        </div>
      </header>
      <div className="grid grid-cols-24 content-start gap-4 px-6 pt-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="col-span-6 h-[112px] rounded-card" />
        ))}
        <Skeleton className="col-span-14 h-[256px] rounded-card" />
        <Skeleton className="col-span-10 h-[256px] rounded-card" />
        <Skeleton className="col-span-16 h-[272px] rounded-card" />
        <Skeleton className="col-span-8 h-[272px] rounded-card" />
      </div>
    </div>
  );
}
