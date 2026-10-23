import type { RangeKey } from '../../server/convex/finance/series';

/**
 * The deployed Convex validators predate the 5Y range. Until the next deploy
 * live queries ask for All instead; the page model is trimmed client-side.
 * Flip after `rangeKeyValidator` with '5Y' is deployed.
 */
export const LIVE_5Y = false;

export function liveRange(range: RangeKey): RangeKey {
  return range === '5Y' && !LIVE_5Y ? 'All' : range;
}
