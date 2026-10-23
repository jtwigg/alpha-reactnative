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
    const digits = value >= 100 ? 0 : 1;
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
  values: (number | null)[],
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

/** One cubic Bézier piece between two adjacent known points. */
export type Curve = {
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
  dashed: boolean;
};

const sign = (value: number) => (value < 0 ? -1 : value > 0 ? 1 : 0);

/**
 * Monotone cubic interpolation (Steffen). Tangents are limited so a curve
 * never overshoots its neighbours: no fake peaks, no dips below a flat run.
 * Tangents are computed per contiguous run, so null gaps stay gaps.
 */
export function buildCurves(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
  gaps?: boolean[],
  dashed = false,
): Curve[] {
  const out: Curve[] = [];
  let i = 0;
  while (i < values.length) {
    if (values[i] == null) {
      i += 1;
      continue;
    }
    const run: number[] = [];
    while (i < values.length && values[i] != null) run.push(i++);
    if (run.length < 2) continue;
    const px = run.map((index) => x(index));
    const py = run.map((index) => y(values[index] as number));
    const n = run.length;
    const h = (k: number) => px[k + 1] - px[k];
    const secant = (k: number) => (h(k) === 0 ? 0 : (py[k + 1] - py[k]) / h(k));
    const tangents = new Array<number>(n).fill(0);
    for (let k = 1; k < n - 1; k += 1) {
      const s0 = secant(k - 1);
      const s1 = secant(k);
      const h0 = h(k - 1);
      const h1 = h(k);
      const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
      tangents[k] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
    }
    if (n === 2) {
      tangents[0] = tangents[1] = secant(0);
    } else {
      tangents[0] = (3 * secant(0) - tangents[1]) / 2;
      tangents[n - 1] = (3 * secant(n - 2) - tangents[n - 2]) / 2;
      // Endpoint tangents must not reverse the first/last secant.
      if (sign(tangents[0]) !== sign(secant(0))) tangents[0] = 0;
      if (sign(tangents[n - 1]) !== sign(secant(n - 2))) tangents[n - 1] = 0;
    }
    for (let k = 0; k < n - 1; k += 1) {
      const third = h(k) / 3;
      out.push({
        x1: px[k],
        y1: py[k],
        cx1: px[k] + third,
        cy1: py[k] + tangents[k] * third,
        cx2: px[k + 1] - third,
        cy2: py[k + 1] - tangents[k + 1] * third,
        x2: px[k + 1],
        y2: py[k + 1],
        dashed: dashed || Boolean(gaps?.[run[k]] || gaps?.[run[k + 1]]),
      });
    }
  }
  return out;
}

const f1 = (value: number) => value.toFixed(1);

export function curvesToPath(curves: Curve[]): string {
  let d = '';
  let last: Curve | null = null;
  for (const c of curves) {
    if (!last || last.x2 !== c.x1 || last.y2 !== c.y1) d += `M${f1(c.x1)},${f1(c.y1)}`;
    d += `C${f1(c.cx1)},${f1(c.cy1)} ${f1(c.cx2)},${f1(c.cy2)} ${f1(c.x2)},${f1(c.y2)}`;
    last = c;
  }
  return d;
}

/** Closed area under the curves down to `baseline`; gaps are bridged straight. */
export function curveAreaPath(curves: Curve[], baseline: number): string {
  if (curves.length === 0) return '';
  let d = `M${f1(curves[0].x1)},${f1(baseline)}L${f1(curves[0].x1)},${f1(curves[0].y1)}`;
  let last = curves[0];
  for (const c of curves) {
    if (last !== c && (last.x2 !== c.x1 || last.y2 !== c.y1)) d += `L${f1(c.x1)},${f1(c.y1)}`;
    d += `C${f1(c.cx1)},${f1(c.cy1)} ${f1(c.cx2)},${f1(c.cy2)} ${f1(c.x2)},${f1(c.y2)}`;
    last = c;
  }
  return `${d}L${f1(last.x2)},${f1(baseline)}Z`;
}

/** Flattens curves into short straight segments for platforms without paths. */
export function sampleCurves(curves: Curve[], maxSegments = 480): Segment[] {
  if (curves.length === 0) return [];
  const steps = Math.max(1, Math.min(8, Math.floor(maxSegments / curves.length)));
  const out: Segment[] = [];
  for (const c of curves) {
    let px = c.x1;
    let py = c.y1;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const u = 1 - t;
      const nx = u * u * u * c.x1 + 3 * u * u * t * c.cx1 + 3 * u * t * t * c.cx2 + t * t * t * c.x2;
      const ny = u * u * u * c.y1 + 3 * u * u * t * c.cy1 + 3 * u * t * t * c.cy2 + t * t * t * c.y2;
      out.push({ x1: px, y1: py, x2: nx, y2: ny, dashed: c.dashed });
      px = nx;
      py = ny;
    }
  }
  return out;
}

/** Closed area under the longest contiguous run, for a gradient fill. */
export function areaPath(
  values: (number | null)[],
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
