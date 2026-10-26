import type { ReactNode } from 'react';
import { Skeleton } from './ui';

// Loading frames shared by the route-level loading.tsx files: the page's own header text with a
// calm skeleton under it, so navigation never shows a blank screen.

export function LoadingPage({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-6 px-6 py-4">
        <div>
          <h1 className="text-[26px] leading-[34px] font-[750] tracking-[-0.01em] text-fg">{title}</h1>
          <p className="flex items-center gap-2 text-fg-2" role="status">
            <span className="size-3 animate-spin rounded-full border-2 border-accent/25 border-t-accent" aria-hidden />
            {message}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">{children}</div>
    </div>
  );
}

export function SkeletonRows({ count = 6, className = 'h-[52px]' }: { count?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}
