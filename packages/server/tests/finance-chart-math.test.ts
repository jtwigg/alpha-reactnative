import { describe, expect, it } from 'vitest';
import {
  areaPath,
  axisDateLabel,
  buildSegments,
  formatCompactUsd,
  niceTicks,
  segmentsToPath,
} from '../../reactnative/lib/chart-math';

describe('chart axis math', () => {
  it('produces round ticks that cover the data', () => {
    const ticks = niceTicks(1_234_000, 5_640_000, 4);
    expect(ticks[0]).toBeLessThanOrEqual(1_234_000);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(5_640_000);
    const step = ticks[1] - ticks[0];
    expect([1, 2, 5].some((n) => (step / 10 ** Math.floor(Math.log10(step))) === n)).toBe(true);
    expect(niceTicks(-300, 900).includes(0)).toBe(true);
    expect(niceTicks(50, 50).length).toBeGreaterThan(1);
  });

  it('formats compact currency for axis labels', () => {
    expect(formatCompactUsd(5_640_000)).toBe('$5.64M');
    expect(formatCompactUsd(-268_400)).toBe('−$268K');
    expect(formatCompactUsd(12_500)).toBe('$12.5K');
    expect(formatCompactUsd(0)).toBe('$0');
  });

  it('labels dates by span', () => {
    expect(axisDateLabel('2014-03-07', 4_000)).toBe('Mar 2014');
    expect(axisDateLabel('2026-10-22', 30)).toBe('Oct 22');
  });

  it('dashes segments touching an interpolated point and skips nulls', () => {
    const segs = buildSegments(
      [1, 2, null, 4, 5],
      (i) => i * 10,
      (v) => v,
      [false, true, false, false, false],
    );
    expect(segs).toHaveLength(2);
    expect(segs[0].dashed).toBe(true);
    expect(segs[1].dashed).toBe(false);
    expect(segmentsToPath(segs)).toBe('M0.0,1.0L10.0,2.0M30.0,4.0L40.0,5.0');
    expect(areaPath([null, 2, 3], (i) => i, (v) => v, 9)).toBe('M1.0,9.0L1.0,2.0L2.0,3.0L2.0,9.0Z');
  });
});
