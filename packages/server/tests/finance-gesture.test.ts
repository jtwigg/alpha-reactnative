import { describe, expect, it } from 'vitest';
import {
  REFRESH_MAX_MS,
  REFRESH_MIN_MS,
  SCRUB_ACTIVE_X,
  SCRUB_FAIL_Y,
  SCRUB_HOLD_MS,
  refreshClearDelay,
  scrubIntent,
} from '../../reactnative/lib/gesture-math';

describe('chart scrub vs pull-to-refresh', () => {
  it('lets a vertical pull through to the ScrollView', () => {
    expect(scrubIntent(0, SCRUB_FAIL_Y)).toBe('fail');
    expect(scrubIntent(3, 40)).toBe('fail');
    expect(scrubIntent(-4, -25)).toBe('fail');
  });

  it('claims a horizontal drag', () => {
    expect(scrubIntent(SCRUB_ACTIVE_X, 0)).toBe('claim');
    expect(scrubIntent(-20, 5)).toBe('claim');
  });

  it('waits inside the dead zone and on diagonal ties', () => {
    expect(scrubIntent(0, 0)).toBe('wait');
    expect(scrubIntent(SCRUB_ACTIVE_X - 1, 2)).toBe('wait');
    expect(scrubIntent(12, 12)).toBe('fail');
  });

  it('claims after a still hold, but a big vertical move still scrolls', () => {
    expect(scrubIntent(0, 2, SCRUB_HOLD_MS)).toBe('claim');
    expect(scrubIntent(0, 2, SCRUB_HOLD_MS - 1)).toBe('wait');
    expect(scrubIntent(0, SCRUB_FAIL_Y, SCRUB_HOLD_MS)).toBe('fail');
  });
});

describe('refresh spinner always resets', () => {
  it('waits while queries are loading', () => {
    expect(refreshClearDelay(100, false)).toBeNull();
  });

  it('keeps the spinner up for a minimum time once settled', () => {
    expect(refreshClearDelay(0, true)).toBe(REFRESH_MIN_MS);
    expect(refreshClearDelay(200, true)).toBe(REFRESH_MIN_MS - 200);
    expect(refreshClearDelay(REFRESH_MIN_MS + 50, true)).toBe(0);
  });

  it('gives up after the timeout even if a query never settles', () => {
    expect(refreshClearDelay(REFRESH_MAX_MS, false)).toBe(0);
    expect(refreshClearDelay(REFRESH_MAX_MS + 1, true)).toBe(0);
  });
});
