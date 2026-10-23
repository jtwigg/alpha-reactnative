/** Horizontal travel before a chart claims the touch (like RNGH `activeOffsetX`). */
export const SCRUB_ACTIVE_X = 8;
/** Vertical travel that hands the touch to the scroll view for good (like `failOffsetY`). */
export const SCRUB_FAIL_Y = 10;
/** A still press this long starts scrubbing even without horizontal travel. */
export const SCRUB_HOLD_MS = 250;

export type ScrubIntent = 'claim' | 'fail' | 'wait';

/**
 * Decide who owns a touch that started on a chart. Vertical pulls must reach
 * the parent ScrollView (pull-to-refresh, scrolling); horizontal drags or a
 * deliberate hold scrub the chart.
 */
export function scrubIntent(dx: number, dy: number, heldMs = 0): ScrubIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (heldMs >= SCRUB_HOLD_MS && ay < SCRUB_FAIL_Y) return 'claim';
  if (ay >= SCRUB_FAIL_Y && ay >= ax) return 'fail';
  if (ax >= SCRUB_ACTIVE_X && ax > ay) return 'claim';
  return 'wait';
}

/** Keep the spinner up at least this long; a sub-frame true→false can strand the iOS spinner. */
export const REFRESH_MIN_MS = 500;
/** Never spin longer than this, even if a query never settles. */
export const REFRESH_MAX_MS = 8000;

/** Milliseconds until the refresh spinner should hide, or null to keep waiting. */
export function refreshClearDelay(elapsedMs: number, settled: boolean): number | null {
  if (elapsedMs >= REFRESH_MAX_MS) return 0;
  if (!settled) return null;
  return Math.max(0, REFRESH_MIN_MS - elapsedMs);
}
