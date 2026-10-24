import { chartStep, type RangeKey } from '../../server/convex/finance/series';

export const RANGE_SUFFIX: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  All: 'all time',
};

export const RANGE_LABEL: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  All: 'full history',
};

/**
 * Live queries always load All. Range pills trim that series on the client so
 * switches are instant. A second subscription for a daily range (1M/3M/YTD/1Y)
 * upgrades resolution in the background without hiding the trimmed series.
 */
export function isDailyRange(range: RangeKey): boolean {
  return chartStep(range) === 'day';
}
