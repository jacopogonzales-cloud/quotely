'use client';

import { useEffect, type ReactNode } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import { useDashboardSnapshot } from '../store';

// Shared frame for the custom widgets: tells Studio the widget has rendered (so it shows no
// loading overlay) and supplies the live dashboard snapshot.

export function useWidget(params: AgWidgetParams) {
  const { widgetApi } = params;
  useEffect(() => {
    widgetApi.setDisplayState('displayed');
  }, [widgetApi]);
  return useDashboardSnapshot();
}

/** Inner padding for custom widget content, matching the inset of Studio's widget titles. */
export const WIDGET_BODY = 'h-full px-2 pb-2';

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-fg-3">{children}</div>;
}
