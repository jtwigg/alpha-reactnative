import { describe, expect, it } from 'vitest';
import {
  areaPath,
  axisDateLabel,
  buildCurves,
  buildSegments,
  curveAreaPath,
  curvesToPath,
  formatCompactUsd,
  sampleCurves,
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
    expect(formatCompactUsd(6_290_000)).toBe('$6.3M');
    expect(formatCompactUsd(540_000)).toBe('$540K');
    expect(formatCompactUsd(5_640_000)).toBe('$5.6M');
    expect(formatCompactUsd(-268_400)).toBe('−$268K');
    expect(formatCompactUsd(12_500)).toBe('$12.5K');
    expect(formatCompactUsd(2_000_000)).toBe('$2M');
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

describe('monotone curves', () => {
  const x = (i: number) => i * 10;
  const y = (v: number) => 100 - v;

  it('never overshoots between points, so flat runs stay flat', () => {
    const values = [10, 10, 10, 40, 41, 41, 5, 5];
    const curves = buildCurves(values, x, y);
    expect(curves).toHaveLength(values.length - 1);
    for (const c of curves) {
      const lo = Math.min(c.y1, c.y2) - 1e-9;
      const hi = Math.max(c.y1, c.y2) + 1e-9;
      for (const cy of [c.cy1, c.cy2]) {
        expect(cy).toBeGreaterThanOrEqual(lo);
        expect(cy).toBeLessThanOrEqual(hi);
      }
    }
    expect(curves[0].cy1).toBe(curves[0].y1);
    expect(curves[1].cy2).toBe(curves[1].y2);
  });

  it('keeps tangents continuous across a run', () => {
    const curves = buildCurves([0, 5, 20, 22, 30], x, y);
    for (let k = 1; k < curves.length; k += 1) {
      const inSlope = (curves[k - 1].y2 - curves[k - 1].cy2) / (curves[k - 1].x2 - curves[k - 1].cx2);
      const outSlope = (curves[k].cy1 - curves[k].y1) / (curves[k].cx1 - curves[k].x1);
      expect(outSlope).toBeCloseTo(inSlope, 9);
    }
  });

  it('breaks at nulls, dashes interpolated pieces, and renders a path', () => {
    const curves = buildCurves([1, 2, null, 4, 5, 6], x, y, [false, false, false, false, true, false]);
    expect(curves.map((c) => [c.x1, c.x2])).toEqual([
      [0, 10],
      [30, 40],
      [40, 50],
    ]);
    expect(curves.map((c) => c.dashed)).toEqual([false, true, true]);
    const d = curvesToPath(curves);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/C/g)).toHaveLength(3);
    expect(buildCurves([null, 3, null], x, y)).toEqual([]);
  });

  it('closes the area at the baseline and samples to the same endpoints', () => {
    const curves = buildCurves([1, 3, 2], x, y);
    const area = curveAreaPath(curves, 120);
    expect(area.startsWith('M0.0,120.0L0.0,99.0C')).toBe(true);
    expect(area.endsWith('L20.0,120.0Z')).toBe(true);
    const segs = sampleCurves(curves, 8);
    expect(segs).toHaveLength(8);
    expect(segs[0].x1).toBe(0);
    expect(segs.at(-1)!.x2).toBeCloseTo(20, 9);
    expect(segs.at(-1)!.y2).toBeCloseTo(98, 9);
    expect(curveAreaPath([], 10)).toBe('');
  });
});
