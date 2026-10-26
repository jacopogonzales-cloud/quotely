'use client';

import { useSyncExternalStore } from 'react';
import type { CashflowData } from '@/lib/cashflow';

// Live data for the custom Studio widgets. Studio reads its `context` property only once, so the
// dashboard publishes each fresh server snapshot here (after a payment arrives, for example) and
// the widgets re-render from it. `navigate` lets a widget open a quote with the app's router.

export type DashboardSnapshot = { data: CashflowData; navigate: (href: string) => void };

let snapshot: DashboardSnapshot | null = null;
const listeners = new Set<() => void>();

export function publishDashboard(next: DashboardSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const get = () => snapshot;

export const useDashboardSnapshot = () => useSyncExternalStore(subscribe, get, get);
