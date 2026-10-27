import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_CHART_RANGE,
  BACKGROUND_RANGES,
  emptyFinanceCache,
  overviewForRange,
  overviewPageArgs,
  pagePackQueryArgs,
  prefetchPlan,
  resetSharedFinanceCache,
  shouldFetchAccountRange,
  shouldRefetchOnTabSwitch,
  wouldShowLoading,
  writePage1M,
  writePagePack,
  writePageRange,
} from '../../lib/finance-prefetch';

const root = join(__dirname, '../..');

describe('finance chart range defaults and cache', () => {
  beforeEach(() => resetSharedFinanceCache());

  it('defaults every chart to 1M', () => {
    expect(DEFAULT_CHART_RANGE).toBe('1M');
    expect(BACKGROUND_RANGES).toEqual(['3M', 'YTD', '1Y', '5Y', 'All']);
    const finances = readFileSync(join(root, 'app/(tabs)/finances.tsx'), 'utf8');
    const account = readFileSync(join(root, 'app/finances/[accountId].tsx'), 'utf8');
    expect(finances).toContain('DEFAULT_CHART_RANGE');
    expect(account).toContain('DEFAULT_CHART_RANGE');
    expect(finances).not.toMatch(/useState<RangeKey>\('All'\)/);
    expect(account).not.toMatch(/initialRange \?\? '1Y'/);
    expect(finances).not.toContain('modelsForRanges');
    expect(account).not.toContain('trimHistoryToRange');
  });

  it('does not refetch or show loading when switching back to a cached 1M tab', () => {
    const cache = emptyFinanceCache();
    expect(shouldRefetchOnTabSwitch(cache)).toBe(true);
    expect(wouldShowLoading(cache, '1M')).toBe(true);
    expect(
      overviewPageArgs({ allowed: true, range: '1M', cache, refreshNonce: 0 }),
    ).toEqual({ range: '1M', refreshNonce: 0 });

    writePage1M(cache, { range: '1M', headline: 1, accounts: [], points: [] });

    expect(shouldRefetchOnTabSwitch(cache)).toBe(false);
    expect(wouldShowLoading(cache, '1M')).toBe(false);
    expect(overviewPageArgs({ allowed: true, range: '1M', cache, refreshNonce: 0 })).toBe('skip');
    expect(overviewForRange(cache, '3M') == null).toBe(true);
    expect(wouldShowLoading(cache, '3M')).toBe(true);
  });

  it('keeps every loaded range and skips pack refetch after the first hit', () => {
    const cache = emptyFinanceCache();
    writePageRange(cache, '3M', { range: '3M', headline: 3, accounts: [], points: [] });
    writePagePack(cache, {
      asOf: '2026-10-23',
      version: 1,
      accounts: [],
      ranges: {},
    });
    expect(shouldRefetchOnTabSwitch(cache, '3M')).toBe(false);
    expect(overviewPageArgs({ allowed: true, range: '3M', cache, refreshNonce: 1 })).toBe('skip');
    expect(pagePackQueryArgs({ allowed: true, cache, refreshNonce: 1 })).toBe('skip');
  });

  it('prefetches 1M first, then one background wave, and never retries in a loop', () => {
    expect(
      prefetchPlan({
        authenticated: true,
        allowed: true,
        primarySettled: false,
        backgroundStarted: false,
      }),
    ).toEqual({ primary: true, background: false });
    expect(
      prefetchPlan({
        authenticated: true,
        allowed: true,
        primarySettled: true,
        backgroundStarted: false,
      }),
    ).toEqual({ primary: true, background: true });
    expect(
      prefetchPlan({
        authenticated: true,
        allowed: false,
        primarySettled: false,
        backgroundStarted: false,
      }),
    ).toEqual({ primary: false, background: false });
    expect(
      prefetchPlan({
        authenticated: false,
        allowed: true,
        primarySettled: true,
        backgroundStarted: true,
      }),
    ).toEqual({ primary: false, background: false });
  });

  it('fetches an account range only when it is selected or in the one background wave', () => {
    expect(
      shouldFetchAccountRange({
        live: true,
        range: '1M',
        selected: '1M',
        cached: false,
        background: false,
        refreshing: false,
      }),
    ).toBe(true);
    expect(
      shouldFetchAccountRange({
        live: true,
        range: '1Y',
        selected: '1M',
        cached: false,
        background: false,
        refreshing: false,
      }),
    ).toBe(false);
    expect(
      shouldFetchAccountRange({
        live: true,
        range: '1Y',
        selected: '1M',
        cached: false,
        background: true,
        refreshing: false,
      }),
    ).toBe(true);
    expect(
      shouldFetchAccountRange({
        live: true,
        range: '1M',
        selected: '1M',
        cached: true,
        background: true,
        refreshing: false,
      }),
    ).toBe(false);
  });
});
