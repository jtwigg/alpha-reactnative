import { describe, expect, it } from 'vitest';
import {
  alignBenchmark,
  benchmarkValuesForDates,
  changeSinceStart,
  closeOnOrBefore,
  indexFromX,
  parseStooqCsv,
  parseYahooChart,
  rebaseClose,
  sampleBenchmarkDates,
  stooqDailyUrl,
  unixSecondsToIsoDate,
  yahooChartUrl,
} from '../convex/finance/benchmarks';

const CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2021-11-15,4680,4690,4670,4682.5,0',
  '2025-11-14,5900,5920,5880,5910.25,0',
  '2026-10-22,6700,6720,6680,6712,0',
  'bad,row',
].join('\n');

describe('Stooq parse and rebase', () => {
  it('builds the public daily URL without a key', () => {
    expect(stooqDailyUrl('^spx')).toBe('https://stooq.com/q/d/l/?s=%5Espx&i=d');
    expect(yahooChartUrl('^GSPC', 1, 2)).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=1&period2=2&interval=1d',
    );
  });

  it('parses a Yahoo chart payload on New York dates', () => {
    const bars = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [1636992000, 1792701108],
            indicators: { quote: [{ close: [4682.5, 6712, null] }] },
          },
        ],
      },
    });
    expect(unixSecondsToIsoDate(1636992000)).toBe('2021-11-15');
    expect(bars[0]).toEqual({ asOf: '2021-11-15', close: 4682.5 });
    expect(bars[1].close).toBe(6712);
  });

  it('parses a Stooq daily CSV', () => {
    const bars = parseStooqCsv(CSV);
    expect(bars).toEqual([
      { asOf: '2021-11-15', close: 4682.5 },
      { asOf: '2025-11-14', close: 5910.25 },
      { asOf: '2026-10-22', close: 6712 },
    ]);
  });

  it('rebases the index to the net-worth start', () => {
    const bars = parseStooqCsv(CSV);
    const start = 5_000_000;
    const aligned = alignBenchmark({
      dates: ['2021-11-15', '2025-11-15', '2026-10-22'],
      startValue: start,
      bars,
    });
    expect(aligned[0].value).toBeCloseTo(start);
    expect(aligned[1].close).toBe(5910.25);
    expect(aligned[2].value).toBeCloseTo(rebaseClose(start, 4682.5, 6712), 4);
    expect(closeOnOrBefore(bars, '2025-11-15')?.asOf).toBe('2025-11-14');
    expect(changeSinceStart(aligned[0].value, aligned[2].value)).toBeCloseTo(
      6712 / 4682.5 - 1,
    );
  });

  it('maps a pointer x to a point index', () => {
    expect(indexFromX(0, 100, 5)).toBe(0);
    expect(indexFromX(100, 100, 5)).toBe(4);
    expect(indexFromX(50, 100, 5)).toBe(2);
    expect(indexFromX(64, 720, 5, 64, 16)).toBe(0);
    expect(indexFromX(720 - 16, 720, 5, 64, 16)).toBe(4);
  });

  it('samples daily dates for a short range and weeks for All', () => {
    const daily = sampleBenchmarkDates('2026-09-01', '2026-10-01');
    expect(daily[0]).toBe('2026-09-01');
    expect(daily[daily.length - 1]).toBe('2026-10-01');
    expect(daily.length).toBe(31);
    const weekly = sampleBenchmarkDates('2014-03-01', '2026-10-22');
    expect(weekly[0]).toBe('2014-03-01');
    expect(weekly[weekly.length - 1]).toBe('2026-10-22');
    expect(weekly.length).toBeLessThan(800);
    expect(weekly.length).toBeGreaterThan(600);
  });

  it('aligns one rebased value per chart date', () => {
    const values = benchmarkValuesForDates(
      ['2021-11-15', '2025-11-15', '2026-10-22'],
      5_000_000,
      parseStooqCsv(CSV),
    );
    expect(values[0]).toBeCloseTo(5_000_000);
    expect(values[2]).toBeCloseTo(rebaseClose(5_000_000, 4682.5, 6712), 4);
  });
});
