import { RANGE_KEYS, type RangeKey } from '../../server/convex/finance/series';
import { pageFromPack, type PagePack, type SeriesPack } from '@/lib/finance-packs';

/** Default chart range on the Finances overview and every account page. */
export const DEFAULT_CHART_RANGE: RangeKey = '1M';

export const BACKGROUND_RANGES: RangeKey[] = RANGE_KEYS.filter((range) => range !== DEFAULT_CHART_RANGE);

export type PrefetchPlan = {
  /** Subscribe to the default 1M page as soon as the user is allowed. */
  primary: boolean;
  /** After 1M is settled, subscribe once to packs / remaining ranges. */
  background: boolean;
};

/**
 * Bounded prefetch: primary (1M) first, then a single background wave.
 * Never re-enters primary after it has started; never loops.
 */
export function prefetchPlan(args: {
  authenticated: boolean;
  allowed: boolean | undefined;
  primarySettled: boolean;
  backgroundStarted: boolean;
}): PrefetchPlan {
  if (!args.authenticated || args.allowed === false) {
    return { primary: false, background: false };
  }
  if (args.allowed !== true) {
    return { primary: false, background: false };
  }
  return {
    primary: true,
    background: args.primarySettled || args.backgroundStarted,
  };
}

export type FinanceCacheSnapshot = {
  allowed?: boolean;
  page1M?: unknown;
  pagePack?: PagePack | null;
  pageByRange: Partial<Record<RangeKey, unknown>>;
  seriesPack: Record<string, SeriesPack>;
  accountDetail: Record<string, unknown>;
  queryStarts: Record<string, number>;
  backgroundStarted: boolean;
};

export function emptyFinanceCache(): FinanceCacheSnapshot {
  return {
    pageByRange: {},
    seriesPack: {},
    accountDetail: {},
    queryStarts: {},
    backgroundStarted: false,
  };
}

/** Process-wide cache so tab remounts keep every loaded range. */
export const sharedFinanceCache: FinanceCacheSnapshot = emptyFinanceCache();

export function resetSharedFinanceCache(): void {
  sharedFinanceCache.allowed = undefined;
  delete sharedFinanceCache.page1M;
  delete sharedFinanceCache.pagePack;
  sharedFinanceCache.pageByRange = {};
  sharedFinanceCache.seriesPack = {};
  sharedFinanceCache.accountDetail = {};
  sharedFinanceCache.queryStarts = {};
  sharedFinanceCache.backgroundStarted = false;
}

export function noteQueryStart(cache: FinanceCacheSnapshot, key: string): void {
  cache.queryStarts[key] = (cache.queryStarts[key] ?? 0) + 1;
}

export function accountDetailKey(sourceId: string, range: RangeKey): string {
  return `${sourceId}:${range}`;
}

export function writeAccountDetail(
  cache: FinanceCacheSnapshot,
  sourceId: string,
  range: RangeKey,
  value: unknown,
): void {
  cache.accountDetail[accountDetailKey(sourceId, range)] = value;
}

export function readAccountDetail<T>(
  cache: FinanceCacheSnapshot,
  sourceId: string,
  range: RangeKey,
): T | undefined {
  return cache.accountDetail[accountDetailKey(sourceId, range)] as T | undefined;
}

export function writePageRange(cache: FinanceCacheSnapshot, range: RangeKey, value: unknown): void {
  cache.pageByRange[range] = value;
  if (range === DEFAULT_CHART_RANGE) cache.page1M = value;
}

export function writePage1M(cache: FinanceCacheSnapshot, value: unknown): void {
  writePageRange(cache, DEFAULT_CHART_RANGE, value);
}

export function writePagePack(cache: FinanceCacheSnapshot, pack: PagePack | null): void {
  cache.pagePack = pack ?? undefined;
}

export function writeSeriesPack(cache: FinanceCacheSnapshot, scope: string, pack: SeriesPack): void {
  cache.seriesPack[scope] = pack;
}

export function overviewForRange(cache: FinanceCacheSnapshot, range: RangeKey): unknown {
  const packed = cache.pagePack ? pageFromPack(cache.pagePack, range) : null;
  if (packed) return packed;
  if (cache.pageByRange[range] !== undefined) return cache.pageByRange[range];
  if (range === DEFAULT_CHART_RANGE) return cache.page1M;
  return undefined;
}

/** True only when this range has never been loaded. Cached hits must not spin. */
export function wouldShowLoading(cache: FinanceCacheSnapshot, range: RangeKey): boolean {
  return overviewForRange(cache, range) == null;
}

/**
 * Tab blur/focus must not start a new 1M query when the cache (or a live
 * root subscription) already holds that range.
 */
export function shouldRefetchOnTabSwitch(
  cache: FinanceCacheSnapshot,
  range: RangeKey = DEFAULT_CHART_RANGE,
): boolean {
  return wouldShowLoading(cache, range);
}

export function markBackgroundStarted(cache: FinanceCacheSnapshot): void {
  cache.backgroundStarted = true;
}

export function overviewPageArgs(args: {
  allowed: boolean | undefined;
  range: RangeKey;
  cache: FinanceCacheSnapshot;
  refreshNonce: number;
}): { range: RangeKey; refreshNonce: number } | 'skip' {
  if (!args.allowed) return 'skip';
  if (overviewForRange(args.cache, args.range) != null) return 'skip';
  return { range: args.range, refreshNonce: args.refreshNonce };
}

export function pagePackQueryArgs(args: {
  allowed: boolean | undefined;
  cache: FinanceCacheSnapshot;
  refreshNonce: number;
}): { refreshNonce: number } | 'skip' {
  if (!args.allowed) return 'skip';
  if (args.cache.pagePack != null) return 'skip';
  return { refreshNonce: args.refreshNonce };
}

export function seriesPackQueryArgs(args: {
  allowed: boolean | undefined;
  scope: string;
  cache: FinanceCacheSnapshot;
  refreshNonce: number;
}): { scope: string; refreshNonce: number } | 'skip' {
  if (!args.allowed) return 'skip';
  if (args.cache.seriesPack[args.scope]) return 'skip';
  return { scope: args.scope, refreshNonce: args.refreshNonce };
}

export function shouldFetchAccountRange(args: {
  live: boolean;
  range: RangeKey;
  selected: RangeKey;
  cached: boolean;
  background: boolean;
  refreshing: boolean;
}): boolean {
  if (!args.live) return false;
  if (args.range !== args.selected && !args.background) return false;
  if (args.cached && !args.refreshing) return false;
  return true;
}
