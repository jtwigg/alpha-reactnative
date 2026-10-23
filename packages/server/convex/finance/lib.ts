import {
  SNAPSHOT_PRECEDENCE,
  formatMoney,
  roundMoney,
  type SnapshotSource,
} from './hash';
import { addDays, daysBetween, parseIsoDate } from './dates';

export type RowStatus =
  | 'inserted'
  | 'updated'
  | 'unchanged'
  | 'skipped_lower_precedence';

export type UpsertCounts = {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedLowerPrecedence: number;
  results: Array<{ key: string; status: RowStatus }>;
};

export function emptyUpsertCounts(): UpsertCounts {
  return {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedLowerPrecedence: 0,
    results: [],
  };
}

export function recordStatus(
  counts: UpsertCounts,
  key: string,
  status: RowStatus,
): void {
  counts.results.push({ key, status });
  if (status === 'skipped_lower_precedence') {
    counts.skippedLowerPrecedence += 1;
    return;
  }
  counts[status] += 1;
}

export function decidePlainWrite(
  existingHash: string | null,
  incomingHash: string,
): Exclude<RowStatus, 'skipped_lower_precedence'> {
  if (existingHash === null) return 'inserted';
  if (existingHash === incomingHash) return 'unchanged';
  return 'updated';
}

/**
 * Pusher is master against the stored row: a sent row overwrites the same
 * key. Exception: interpolated never overwrites a non-interpolated row
 * (fillGaps and interpolated ingest). Intra-batch collisions are resolved
 * separately with `selectBatchWinner` (manual > observed > reconstructed >
 * interpolated; later row wins ties).
 */
export function decideSnapshotWrite(
  existing: { source: SnapshotSource; contentHash: string } | null,
  incoming: { source: SnapshotSource; contentHash: string },
): RowStatus {
  if (existing === null) return 'inserted';
  if (incoming.source === 'interpolated' && existing.source !== 'interpolated') {
    return 'skipped_lower_precedence';
  }
  if (existing.contentHash === incoming.contentHash) {
    return 'unchanged';
  }
  return 'updated';
}

export function snapshotRank(source: SnapshotSource): number {
  return SNAPSHOT_PRECEDENCE[source];
}

/**
 * Keep the highest-precedence item. On a tie, the later index wins.
 * `losers` are original indexes that lost.
 */
export function selectBatchWinner<T>(
  items: readonly T[],
  rank: (item: T, index: number) => number,
): { winner: T; winnerIndex: number; loserIndexes: number[] } {
  if (items.length === 0) {
    throw new Error('selectBatchWinner: empty group');
  }
  let winnerIndex = 0;
  let best = rank(items[0], 0);
  for (let i = 1; i < items.length; i += 1) {
    const value = rank(items[i], i);
    if (value >= best) {
      best = value;
      winnerIndex = i;
    }
  }
  const loserIndexes: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (i !== winnerIndex) loserIndexes.push(i);
  }
  return { winner: items[winnerIndex], winnerIndex, loserIndexes };
}

export type InterpolatedPoint = {
  asOf: string;
  balance: number;
  source: 'interpolated';
  method: 'linear';
};

/**
 * Daily linear interpolation strictly between neighboring non-interpolated
 * anchors. `balance(d) = b0 + (b1-b0) * days(d0,d)/days(d0,d1)`, then
 * rounded with the money recipe (8 decimals).
 */
export function interpolateBetween(
  left: { asOf: string; balance: number },
  right: { asOf: string; balance: number },
): InterpolatedPoint[] {
  parseIsoDate(left.asOf);
  parseIsoDate(right.asOf);
  const span = daysBetween(left.asOf, right.asOf);
  if (span <= 1) return [];
  const points: InterpolatedPoint[] = [];
  for (let i = 1; i < span; i += 1) {
    const asOf = addDays(left.asOf, i);
    const t = i / span;
    const balance = roundMoney(left.balance + (right.balance - left.balance) * t);
    points.push({ asOf, balance, source: 'interpolated', method: 'linear' });
  }
  return points;
}

export function planFillGaps(args: {
  from: string;
  to: string;
  anchors: Array<{ asOf: string; balance: number }>;
}): InterpolatedPoint[] {
  const { from, to, anchors } = args;
  parseIsoDate(from);
  parseIsoDate(to);
  if (to < from) {
    throw new Error('fillGaps: `to` must be on or after `from`');
  }
  const sorted = [...anchors].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const unique: Array<{ asOf: string; balance: number }> = [];
  for (const anchor of sorted) {
    const last = unique[unique.length - 1];
    if (last && last.asOf === anchor.asOf) {
      unique[unique.length - 1] = anchor;
      continue;
    }
    unique.push(anchor);
  }
  const planned: InterpolatedPoint[] = [];
  for (let i = 0; i < unique.length - 1; i += 1) {
    for (const point of interpolateBetween(unique[i], unique[i + 1])) {
      if (point.asOf >= from && point.asOf <= to) {
        planned.push(point);
      }
    }
  }
  return planned;
}

export function formatFixedSum(values: number[]): string {
  let scaled = 0n;
  for (const value of values) {
    const formatted = formatMoney(value);
    const negative = formatted.startsWith('-');
    const abs = negative ? formatted.slice(1) : formatted;
    const [whole, frac] = abs.split('.');
    const part = BigInt(whole) * 100000000n + BigInt(frac);
    scaled += negative ? -part : part;
  }
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, '0');
  return `${sign}${whole.toString()}.${frac}`;
}

export function assertBatchSize(length: number, cap = 500): void {
  if (length > cap) {
    throw new Error(`Batch exceeds cap of ${cap}`);
  }
}

export function encodeCursor(payload: unknown): string {
  return JSON.stringify(payload);
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  return JSON.parse(cursor) as T;
}
