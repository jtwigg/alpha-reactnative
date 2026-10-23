import { daysBetween, eachDate, eachWeek, todayInTimeZone } from './dates';

export type BenchmarkId = 'SPX' | 'NDX' | 'BALANCED_60_40';

export type BenchmarkDef = {
  id: BenchmarkId;
  label: string;
  /** Stooq daily symbol, no API key. */
  stooq: string;
  /** Yahoo chart symbol used when Stooq serves a bot wall. */
  yahoo: string;
  color: string;
};

export const BENCHMARKS: Record<BenchmarkId, BenchmarkDef> = {
  SPX: {
    id: 'SPX',
    label: 'S&P 500',
    stooq: '^spx',
    yahoo: '^GSPC',
    color: '#c2410c',
  },
  NDX: {
    id: 'NDX',
    label: 'Nasdaq 100',
    stooq: '^ndx',
    yahoo: '^NDX',
    color: '#7c3aed',
  },
  BALANCED_60_40: {
    id: 'BALANCED_60_40',
    label: '60/40',
    stooq: '^spx',
    yahoo: '^GSPC',
    color: '#0f766e',
  },
};

export const DEFAULT_BENCHMARK: BenchmarkId = 'SPX';

export type IndexBar = { asOf: string; close: number };

/** Daily bars when the range is short; weekly samples otherwise. */
export const DAILY_BENCHMARK_SPAN_DAYS = 400;
export const BENCHMARK_SAMPLE_CAP = 800;
export const BENCHMARK_STALE_MS = 20 * 60 * 60 * 1000;

export function stooqDailyUrl(stooqSymbol: string): string {
  const encoded = encodeURIComponent(stooqSymbol);
  return `https://stooq.com/q/d/l/?s=${encoded}&i=d`;
}

export function yahooChartUrl(
  yahooSymbol: string,
  period1: number,
  period2: number,
): string {
  const encoded = encodeURIComponent(yahooSymbol);
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?period1=${period1}&period2=${period2}&interval=1d`;
}

export function unixSecondsToIsoDate(seconds: number): string {
  return todayInTimeZone(new Date(seconds * 1000), 'America/New_York');
}

export function parseYahooChart(payload: unknown): IndexBar[] {
  const root = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = root.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return [];
  const out: IndexBar[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    out.push({ asOf: unixSecondsToIsoDate(timestamps[i]), close });
  }
  out.sort((a, b) => a.asOf.localeCompare(b.asOf));
  return out;
}

export function parseStooqCsv(csv: string): IndexBar[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  if (!header.includes('date') || !header.includes('close')) return [];
  const out: IndexBar[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const asOf = cols[0]?.trim();
    const close = Number(cols[4] ?? cols[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    out.push({ asOf, close });
  }
  out.sort((a, b) => a.asOf.localeCompare(b.asOf));
  return out;
}

export function closeOnOrBefore(bars: IndexBar[], date: string): IndexBar | null {
  let found: IndexBar | null = null;
  for (const bar of bars) {
    if (bar.asOf <= date) found = bar;
    else break;
  }
  return found;
}

export function rebaseClose(
  startValue: number,
  startClose: number,
  close: number,
): number {
  if (startClose === 0) return startValue;
  return (startValue * close) / startClose;
}

export function alignBenchmark(args: {
  dates: string[];
  startValue: number;
  bars: IndexBar[];
}): Array<{ asOf: string; value: number; close: number }> {
  if (args.dates.length === 0 || args.bars.length === 0) return [];
  const startBar = closeOnOrBefore(args.bars, args.dates[0]);
  if (!startBar) return [];
  const out: Array<{ asOf: string; value: number; close: number }> = [];
  for (const date of args.dates) {
    const bar = closeOnOrBefore(args.bars, date);
    if (!bar) continue;
    out.push({
      asOf: date,
      close: bar.close,
      value: rebaseClose(args.startValue, startBar.close, bar.close),
    });
  }
  return out;
}

export function changeSinceStart(start: number, value: number): number | null {
  if (start === 0) return null;
  return value / start - 1;
}

export function sampleBenchmarkDates(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  const raw = span <= DAILY_BENCHMARK_SPAN_DAYS ? eachDate(from, to) : eachWeek(from, to);
  if (raw.length <= BENCHMARK_SAMPLE_CAP) return raw;
  const out: string[] = [];
  const last = raw.length - 1;
  const step = last / (BENCHMARK_SAMPLE_CAP - 1);
  for (let i = 0; i < BENCHMARK_SAMPLE_CAP; i += 1) {
    const next = raw[Math.round(i * step)];
    if (out[out.length - 1] !== next) out.push(next);
  }
  return out;
}

export function benchmarkValuesForDates(
  dates: string[],
  startValue: number,
  bars: IndexBar[],
): Array<number | null> {
  const aligned = alignBenchmark({ dates, startValue, bars });
  const byDate = new Map(aligned.map((row) => [row.asOf, row.value]));
  return dates.map((date) => byDate.get(date) ?? null);
}

export function indexFromX(
  x: number,
  width: number,
  count: number,
  padLeft = 0,
  padRight = 0,
): number {
  if (count <= 1 || width <= 0) return 0;
  const inner = Math.max(width - padLeft - padRight, 1);
  const t = (x - padLeft) / inner;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}
