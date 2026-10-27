import { useConvexAuth, useQuery } from 'convex/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { QueryErrorBoundary } from '@/components/query-error-boundary';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import {
  DEFAULT_CHART_RANGE,
  emptyFinanceCache,
  markBackgroundStarted,
  noteQueryStart,
  overviewForRange,
  prefetchPlan,
  readAccountDetail,
  sharedFinanceCache,
  wouldShowLoading,
  writeAccountDetail,
  writePage1M,
  writePagePack,
  type FinanceCacheSnapshot,
} from '@/lib/finance-prefetch';
import type { PagePack, SeriesPack } from '@/lib/finance-packs';
import type { RangeKey } from '../../server/convex/finance/series';

export type FinancePrefetchValue = {
  allowed: boolean | undefined;
  refreshNonce: number;
  refresh: () => void;
  pagePack: PagePack | null | undefined;
  page1M: unknown;
  seriesPack: (scope: string) => SeriesPack | undefined;
  overview: (range: RangeKey) => unknown;
  showLoading: (range: RangeKey) => boolean;
  readAccount: <T>(sourceId: string, range: RangeKey) => T | undefined;
  writeAccount: (sourceId: string, range: RangeKey, value: unknown) => void;
  cache: FinanceCacheSnapshot;
};

const EMPTY: FinancePrefetchValue = {
  allowed: undefined,
  refreshNonce: 0,
  refresh: () => undefined,
  pagePack: undefined,
  page1M: undefined,
  seriesPack: () => undefined,
  overview: () => undefined,
  showLoading: () => true,
  readAccount: () => undefined,
  writeAccount: () => undefined,
  cache: emptyFinanceCache(),
};

const FinancePrefetchContext = createContext<FinancePrefetchValue>(EMPTY);

const shared = sharedFinanceCache;

export function useFinancePrefetch(): FinancePrefetchValue {
  return useContext(FinancePrefetchContext);
}

function FinancePrefetchInner({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ready = isClerkConfigured() && isAuthenticated;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  const allowed = useQuery(api.finance.queries.isAllowed, ready ? {} : 'skip');
  if (typeof allowed === 'boolean') shared.allowed = allowed;

  const plan = prefetchPlan({
    authenticated: Boolean(ready),
    allowed,
    primarySettled: shared.page1M !== undefined || allowed === false,
    backgroundStarted: shared.backgroundStarted,
  });

  const started = useRef<Record<string, boolean>>({});
  const startOnce = (key: string) => {
    if (started.current[key]) return;
    started.current[key] = true;
    noteQueryStart(shared, key);
  };

  if (plan.primary) startOnce(`page:${DEFAULT_CHART_RANGE}`);
  const page1M = useQuery(
    api.finance.queries.page,
    plan.primary ? { range: DEFAULT_CHART_RANGE, refreshNonce } : 'skip',
  );
  useEffect(() => {
    if (page1M !== undefined) {
      writePage1M(shared, page1M);
      bump();
    }
  }, [page1M]);

  useEffect(() => {
    if (plan.background) markBackgroundStarted(shared);
  }, [plan.background]);

  if (plan.background) {
    startOnce('pagePack');
    startOnce('seriesPack:total');
    startOnce('seriesPack:reliable_subset');
  }
  const pagePack = useQuery(
    api.finance.queries.pagePack,
    plan.background ? { refreshNonce } : 'skip',
  ) as PagePack | null | undefined;
  const seriesTotal = useQuery(
    api.finance.queries.seriesPack,
    plan.background ? { scope: 'total', refreshNonce } : 'skip',
  ) as SeriesPack | null | undefined;
  const seriesReliable = useQuery(
    api.finance.queries.seriesPack,
    plan.background ? { scope: 'reliable_subset', refreshNonce } : 'skip',
  ) as SeriesPack | null | undefined;

  useEffect(() => {
    if (pagePack !== undefined) {
      writePagePack(shared, pagePack);
      bump();
    }
  }, [pagePack]);
  useEffect(() => {
    if (seriesTotal) {
      shared.seriesPack.total = seriesTotal;
      bump();
    }
  }, [seriesTotal]);
  useEffect(() => {
    if (seriesReliable) {
      shared.seriesPack.reliable_subset = seriesReliable;
      bump();
    }
  }, [seriesReliable]);

  const value = useMemo<FinancePrefetchValue>(() => {
    void tick;
    return {
      allowed: shared.allowed ?? allowed,
      refreshNonce,
      refresh: () => setRefreshNonce((n) => n + 1),
      pagePack: shared.pagePack ?? pagePack ?? undefined,
      page1M: shared.page1M ?? page1M,
      seriesPack: (scope) => shared.seriesPack[scope],
      overview: (range) => overviewForRange(shared, range),
      showLoading: (range) => wouldShowLoading(shared, range),
      readAccount: (sourceId, range) => readAccountDetail(shared, sourceId, range),
      writeAccount: (sourceId, range, next) => {
        writeAccountDetail(shared, sourceId, range, next);
        bump();
      },
      cache: shared,
    };
  }, [allowed, page1M, pagePack, refreshNonce, tick]);

  return <FinancePrefetchContext.Provider value={value}>{children}</FinancePrefetchContext.Provider>;
}

/** Keeps 1M (then the other ranges) subscribed above the tab navigator. */
export function FinancePrefetchProvider({ children }: { children: ReactNode }) {
  return (
    <QueryErrorBoundary
      surface="finance-prefetch"
      fallback={<FinancePrefetchContext.Provider value={EMPTY}>{children}</FinancePrefetchContext.Provider>}>
      <FinancePrefetchInner>{children}</FinancePrefetchInner>
    </QueryErrorBoundary>
  );
}
