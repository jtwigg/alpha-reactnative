function niceNum(value: number, round: boolean): number {
  const exp = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exp;
  let nice: number;
  if (round) {
    nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return nice * 10 ** exp;
}

/** Evenly spaced round-number ticks that cover [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const span = niceNum(hi - lo, false);
  const step = niceNum(span / Math.max(count - 1, 1), true);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : Number(value.toPrecision(12)));
  }
  return ticks;
}

export function formatCompactUsd(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  const fmt = (value: number, unit: string) => {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${sign}$${Number(value.toFixed(digits))}${unit}`;
  };
  if (abs >= 1e9) return fmt(abs / 1e9, 'B');
  if (abs >= 1e6) return fmt(abs / 1e6, 'M');
  if (abs >= 1e3) return fmt(abs / 1e3, 'K');
  return `${sign}$${Math.round(abs)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short axis label. Long spans show month + year, short spans month + day. */
export function axisDateLabel(iso: string, spanDays: number): string {
  const year = iso.slice(0, 4);
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  const day = Number(iso.slice(8, 10));
  if (spanDays > 400) return `${month} ${year}`;
  return `${month} ${day}`;
}

export function spanInDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type Segment = { x1: number; y1: number; x2: number; y2: number; dashed: boolean };

export function buildSegments(
  values: Array<number | null>,
  x: (index: number) => number,
  y: (value: number) => number,
  gaps?: boolean[],
  dashed = false,
): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < values.length - 1; i += 1) {
    const a = values[i];
    const b = values[i + 1];
    if (a == null || b == null) continue;
    out.push({
      x1: x(i),
      y1: y(a),
      x2: x(i + 1),
      y2: y(b),
      dashed: dashed || Boolean(gaps?.[i] || gaps?.[i + 1]),
    });
  }
  return out;
}

export function segmentsToPath(segments: Segment[]): string {
  let d = '';
  let lastX: number | null = null;
  let lastY: number | null = null;
  for (const seg of segments) {
    if (lastX !== seg.x1 || lastY !== seg.y1) d += `M${seg.x1.toFixed(1)},${seg.y1.toFixed(1)}`;
    d += `L${seg.x2.toFixed(1)},${seg.y2.toFixed(1)}`;
    lastX = seg.x2;
    lastY = seg.y2;
  }
  return d;
}

/** Closed area under the longest contiguous run, for a gradient fill. */
export function areaPath(
  values: Array<number | null>,
  x: (index: number) => number,
  y: (value: number) => number,
  baseline: number,
): string {
  const first = values.findIndex((value) => value != null);
  if (first < 0) return '';
  let d = `M${x(first).toFixed(1)},${baseline.toFixed(1)}`;
  let last = first;
  for (let i = first; i < values.length; i += 1) {
    const value = values[i];
    if (value == null) continue;
    d += `L${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    last = i;
  }
  d += `L${x(last).toFixed(1)},${baseline.toFixed(1)}Z`;
  return d;
}
