import { useCallback, useEffect, useRef, useState } from 'react';

import { REFRESH_MAX_MS, refreshClearDelay } from '@/lib/gesture-math';

/**
 * Spinner state shared by RefreshControl (native) and the web refresh button.
 * `onStart` should bump the caller's refresh nonce so Convex re-subscribes;
 * pass `settled` once the queries that matter have results again. The spinner
 * always clears, even if a query never settles.
 */
export function useRefreshSpinner(settled: boolean, onStart: () => void) {
  const [refreshing, setRefreshing] = useState(false);
  const startedAt = useRef(0);
  const latestStart = useRef(onStart);
  latestStart.current = onStart;

  useEffect(() => {
    if (!refreshing) return;
    const elapsed = Date.now() - startedAt.current;
    const delay = refreshClearDelay(elapsed, settled) ?? REFRESH_MAX_MS - elapsed;
    const timer = setTimeout(() => setRefreshing(false), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [refreshing, settled]);

  const onRefresh = useCallback(() => {
    startedAt.current = Date.now();
    setRefreshing(true);
    latestStart.current();
  }, []);

  return { refreshing, onRefresh };
}
