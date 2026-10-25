import { describe, expect, it } from 'vitest';
import { chartOverlayKind } from '../../reactnative/lib/chart-overlay';
import { alignFieldToDates, flowAdjustedOverlay } from '../convex/finance/seriesModel';

describe('chartOverlayKind', () => {
  it('covers the four toggle combinations', () => {
    expect(chartOverlayKind({ timeWeighted: false, showSp500: false, hasSeries: true })).toBe('balance');
    expect(chartOverlayKind({ timeWeighted: false, showSp500: false, hasSeries: false })).toBe('balance');
    expect(chartOverlayKind({ timeWeighted: false, showSp500: true, hasSeries: true })).toBe('balance+flow');
    expect(chartOverlayKind({ timeWeighted: false, showSp500: true, hasSeries: false })).toBe(
      'balance+rebased',
    );
    expect(chartOverlayKind({ timeWeighted: true, showSp500: false, hasSeries: true })).toBe('twr');
    expect(chartOverlayKind({ timeWeighted: true, showSp500: false, hasSeries: false })).toBe('twr');
    expect(chartOverlayKind({ timeWeighted: true, showSp500: true, hasSeries: true })).toBe('twr+sp500');
    expect(chartOverlayKind({ timeWeighted: true, showSp500: true, hasSeries: false })).toBe('twr+sp500');
  });
});

describe('flow-adjusted S&P overlay', () => {
  it('carries last-at-or-before onto the chart dates', () => {
    expect(
      alignFieldToDates(
        ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'],
        [
          { asOf: '2026-01-02', value: 10 },
          { asOf: '2026-01-04', value: 20 },
        ],
      ),
    ).toEqual([null, 10, 10, 20]);
  });

  it('rebases the flow-adjusted path onto the visible start balance', () => {
    expect(
      flowAdjustedOverlay(
        ['2026-01-01', '2026-01-02', '2026-01-03'],
        100,
        [
          { asOf: '2026-01-01', sp500Equiv: 50 },
          { asOf: '2026-01-02', sp500Equiv: 55 },
          { asOf: '2026-01-03', sp500Equiv: 60 },
        ],
      ),
    ).toEqual([100, 110, 120]);
  });

  it('leaves the raw path when the first series value is missing or zero', () => {
    expect(flowAdjustedOverlay(['2026-01-01'], 100, [])).toEqual([null]);
    expect(flowAdjustedOverlay(['2026-01-01'], 100, [{ asOf: '2026-01-01', sp500Equiv: 0 }])).toEqual([
      0,
    ]);
  });
});
