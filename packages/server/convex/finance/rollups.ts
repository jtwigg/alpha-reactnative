import {
  addDays,
  daysBetween,
  eachDate,
  eachMonthEnd,
  eachWeekEnd,
  monthEnd,
  monthStart,
  weekEnd,
  weekStart,
} from './dates';
import { groupKeyForClass, type AccountGroupKey } from './accountModel';
import { roundMoney, type SnapshotSource } from './hash';
import {
  accountValueOnDay,
  grainForRange,
  signedAmount,
  type ChartPoint,
  type PageAccount,
  type RangeKey,
  type RollupFreshness,
  type RollupGrain,
  type SeriesAccount,
  type SeriesSnapshot,
} from './series';

export const ROLLUP_GRAINS = ['day', 'week', 'month'] as const;
export type { RollupFreshness, RollupGrain };

export const ROLLUP_SCOPE_KINDS = ['account', 'class', 'group', 'total', 'bench', 'series'] as const;
export type RollupScopeKind = (typeof ROLLUP_SCOPE_KINDS)[number];

export const ROLLUP_STATUSES = ['ready', 'pending', 'rebuilding'] as const;
export type RollupStatus = (typeof ROLLUP_STATUSES)[number];

export const ROLLUP_FRESHNESS = ['live', 'stale', 'raw'] as const;

export const GLOBAL_ROLLUP_KEY = 'global';
export const TOTAL_SCOPE_ID = 'net';
export const BENCH_SCOPE_ID = 'SPX';

export const ROLLUP_WRITE_BUDGET = 700;
export const ROLLUP_DELETE_BATCH = 400;
export const ROLLUP_CONSISTENCY_SAMPLE = 16;
export const ROLLUP_CONSISTENCY_EPS = 0.02;
/** Persist finance_rollup_state at most this often during a rebuild. */
export const ROLLUP_STATE_PATCH_DAYS = 7;
export const ROLLUP_DIRTY_DRAIN = 200;

export type RollupRow = {
  grain: RollupGrain;
  scopeKind: RollupScopeKind;
  scopeId: string;
  asOf: string;
  value: number;
  interpolated: boolean;
  byClass?: Record<string, number>;
  netInvested?: number;
  sp500Equiv?: number;
  estimated?: boolean;
  version: number;
};

export type RollupStateView = {
  dirtyFrom: string | null;
  rebuiltThrough: string | null;
  version: number;
  status: RollupStatus;
};

export type DirtyTouch = { accountId: string; from: string };

export type RebuildCursor = {
  from: string;
  to: string;
  day: string;
  wipe: boolean;
};

export type DatedBalance = {
  asOf: string;
  balance: number;
  source: SnapshotSource;
};

export { grainForRange };

export function grainDates(grain: RollupGrain, from: string, to: string): string[] {
  if (to < from) return [];
  if (grain === 'month') return eachMonthEnd(from, to);
  if (grain === 'week') return eachWeekEnd(from, to);
  return eachDate(from, to);
}

export function enclosingWeekEnds(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let end = weekEnd(from);
  const last = weekEnd(to);
  while (end <= last) {
    out.push(end);
    end = addDays(end, 7);
  }
  return out;
}

export function enclosingMonthEnds(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let cursor = monthEnd(from);
  const last = monthEnd(to);
  while (cursor <= last) {
    out.push(cursor);
    cursor = monthEnd(addDays(cursor, 1));
  }
  return out;
}

export function mergeDirtyFrom(current: string | null | undefined, incoming: string): string {
  return current && current < incoming ? current : incoming;
}

export function mergeDiries(current: DirtyTouch[], incoming: DirtyTouch[]): DirtyTouch[] {
  const byAccount = new Map<string, string>();
  for (const row of [...current, ...incoming]) {
    if (!row.accountId || !row.from) continue;
    const prev = byAccount.get(row.accountId);
    byAccount.set(row.accountId, prev ? mergeDirtyFrom(prev, row.from) : row.from);
  }
  return [...byAccount.entries()]
    .map(([accountId, from]) => ({ accountId, from }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export function earliestDirty(dirties: DirtyTouch[]): string | null {
  let min: string | null = null;
  for (const row of dirties) {
    if (!min || row.from < min) min = row.from;
  }
  return min;
}

/**
 * How many calendar days one rebuild mutation can materialize for every
 * account plus class/group/total/bench rows for those days.
 */
export function daysPerRebuildStep(accountCount: number, writeBudget = ROLLUP_WRITE_BUDGET): number {
  const perDay = Math.max(accountCount, 1) + 12;
  return Math.max(1, Math.min(21, Math.floor(writeBudget / perDay)));
}

export function planRebuildSpan(args: {
  from: string;
  to: string;
  day: string;
  accountCount: number;
  writeBudget?: number;
}): { start: string; end: string; next: string | null } {
  const start = args.day < args.from ? args.from : args.day;
  if (start > args.to) return { start, end: args.to, next: null };
  const span = daysPerRebuildStep(args.accountCount, args.writeBudget);
  const rawEnd = addDays(start, span - 1);
  const end = rawEnd < args.to ? rawEnd : args.to;
  const next = end < args.to ? addDays(end, 1) : null;
  return { start, end, next };
}

/** Skip patching the global state doc unless status/wipe changed or the cursor moved a week. */
export function shouldPatchRebuildState(args: {
  prevDay: string;
  nextDay: string;
  prevStatus: RollupStatus;
  nextStatus: RollupStatus;
  prevWipe: boolean;
  nextWipe: boolean;
  drained: boolean;
  done: boolean;
}): boolean {
  if (args.done) return true;
  if (args.drained) return true;
  if (args.prevStatus !== args.nextStatus) return true;
  if (args.prevWipe !== args.nextWipe) return true;
  return daysBetween(args.prevDay, args.nextDay) >= ROLLUP_STATE_PATCH_DAYS;
}

export function encodeRebuildCursor(cursor: RebuildCursor): string {
  return JSON.stringify(cursor);
}

export function decodeRebuildCursor(raw: string | undefined | null): RebuildCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RebuildCursor>;
    if (
      typeof parsed.from !== 'string' ||
      typeof parsed.to !== 'string' ||
      typeof parsed.day !== 'string' ||
      typeof parsed.wipe !== 'boolean'
    ) {
      return null;
    }
    return { from: parsed.from, to: parsed.to, day: parsed.day, wipe: parsed.wipe };
  } catch {
    return null;
  }
}

export function readerMode(args: {
  state: RollupStateView | null;
  hasCoverage: boolean;
  asOf: string;
}): RollupFreshness {
  if (!args.hasCoverage || !args.state) return 'raw';
  const rebuilt = args.state.rebuiltThrough;
  if (args.state.status === 'ready' && !args.state.dirtyFrom && rebuilt && rebuilt >= args.asOf) {
    return 'live';
  }
  return 'stale';
}

export function rollupCoversRange(args: {
  rows: Array<{ asOf: string }>;
  from: string;
  to: string;
  grain: RollupGrain;
}): boolean {
  if (args.rows.length === 0) return false;
  const first = args.rows[0].asOf;
  const last = args.rows[args.rows.length - 1].asOf;
  if (args.grain === 'day') {
    return first <= addDays(args.from, 2) && last >= addDays(args.to, -2);
  }
  if (args.grain === 'week') {
    return first <= addDays(args.from, 8) && last >= addDays(args.to, -8);
  }
  return first <= addDays(args.from, 32) && last >= addDays(args.to, -32);
}

export function accountDayValue(
  snaps: DatedBalance[],
  day: string,
  current: { balance: number; asOf: string },
): { value: number; interpolated: boolean } | null {
  const hit = accountValueOnDay(snaps, day, current);
  if (!hit) return null;
  return { value: roundMoney(hit.balance), interpolated: hit.interpolated };
}

export type ComputedDay = {
  asOf: string;
  value: number;
  interpolated: boolean;
  netInvested?: number;
  sp500Equiv?: number;
  estimated?: boolean;
};

export function computeAccountDays(args: {
  snaps: DatedBalance[];
  from: string;
  to: string;
  current: { balance: number; asOf: string };
}): ComputedDay[] {
  if (args.to < args.from) return [];
  const out: ComputedDay[] = [];
  for (const day of eachDate(args.from, args.to)) {
    const hit = accountDayValue(args.snaps, day, args.current);
    if (!hit) continue;
    out.push({ asOf: day, value: hit.value, interpolated: hit.interpolated });
  }
  return out;
}

export type AccountDayInput = {
  accountId: string;
  className: string;
  days: ComputedDay[];
};

export type AggregatedDay = {
  asOf: string;
  total: number;
  interpolated: boolean;
  byClass: Record<string, number>;
  byGroup: Record<string, number>;
};

export function aggregateAccountDays(accounts: AccountDayInput[]): AggregatedDay[] {
  const byDate = new Map<string, AggregatedDay>();
  for (const account of accounts) {
    const group = groupKeyForClass(account.className);
    for (const day of account.days) {
      const signed = signedAmount(account.className, day.value);
      const row = byDate.get(day.asOf) ?? {
        asOf: day.asOf,
        total: 0,
        interpolated: false,
        byClass: {},
        byGroup: {},
      };
      row.total = roundMoney(row.total + signed);
      row.byClass[account.className] = roundMoney((row.byClass[account.className] ?? 0) + signed);
      row.byGroup[group] = roundMoney((row.byGroup[group] ?? 0) + signed);
      if (day.interpolated) row.interpolated = true;
      byDate.set(day.asOf, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.asOf.localeCompare(b.asOf));
}

export function lastInBucket(
  days: ComputedDay[],
  start: string,
  end: string,
): ComputedDay | null {
  let found: ComputedDay | null = null;
  for (const day of days) {
    if (day.asOf < start) continue;
    if (day.asOf > end) break;
    found = day;
  }
  return found;
}

export function rollupCoarse(
  days: ComputedDay[],
  grain: 'week' | 'month',
  from: string,
  to: string,
): ComputedDay[] {
  const ends = grain === 'week' ? enclosingWeekEnds(from, to) : enclosingMonthEnds(from, to);
  const out: ComputedDay[] = [];
  for (const end of ends) {
    const start = grain === 'week' ? weekStart(end) : monthStart(end);
    const hit = lastInBucket(days, start, end);
    if (!hit) continue;
    out.push({
      asOf: end,
      value: hit.value,
      interpolated: hit.interpolated,
      netInvested: hit.netInvested,
      sp500Equiv: hit.sp500Equiv,
      estimated: hit.estimated,
    });
  }
  return out;
}

export function coarseFromAggregates(
  days: AggregatedDay[],
  grain: 'week' | 'month',
  from: string,
  to: string,
): AggregatedDay[] {
  const asDays: ComputedDay[] = days.map((row) => ({
    asOf: row.asOf,
    value: row.total,
    interpolated: row.interpolated,
  }));
  const ends = rollupCoarse(asDays, grain, from, to);
  const byDate = new Map(days.map((row) => [row.asOf, row]));
  return ends.map((end) => {
    const source = lastInBucket(
      asDays,
      grain === 'week' ? weekStart(end.asOf) : monthStart(end.asOf),
      end.asOf,
    );
    const raw = source ? byDate.get(source.asOf) : undefined;
    return {
      asOf: end.asOf,
      total: end.value,
      interpolated: end.interpolated,
      byClass: raw?.byClass ?? {},
      byGroup: raw?.byGroup ?? {},
    };
  });
}

export function benchDays(
  bars: Array<{ asOf: string; close: number }>,
  from: string,
  to: string,
): ComputedDay[] {
  if (bars.length === 0 || to < from) return [];
  const ordered = [...bars].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const out: ComputedDay[] = [];
  let index = 0;
  let last: { asOf: string; close: number } | null = null;
  for (const day of eachDate(from, to)) {
    while (index < ordered.length && ordered[index].asOf <= day) {
      last = ordered[index];
      index += 1;
    }
    if (!last) continue;
    out.push({ asOf: day, value: last.close, interpolated: last.asOf !== day });
  }
  return out;
}

export function compareRollupToRaw(rollup: number, raw: number, eps = ROLLUP_CONSISTENCY_EPS): boolean {
  return Math.abs(rollup - raw) <= eps;
}

export function pickSampleDates(from: string, to: string, sample: number, seed = 1): string[] {
  const days = eachDate(from, to);
  if (days.length === 0) return [];
  if (days.length <= sample) return days;
  const out: string[] = [];
  const seen = new Set<number>();
  let state = seed >>> 0 || 1;
  while (out.length < sample) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = state % days.length;
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(days[index]);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function pageAccountsFromSeries(
  accounts: SeriesAccount[],
  ends: Map<string, SeriesSnapshot>,
  firsts: Map<string, SeriesSnapshot>,
): PageAccount[] {
  return accounts
    .map((account) => {
      const latest = ends.get(account.sourceId) ?? null;
      const first = firsts.get(account.sourceId) ?? null;
      const balance = latest?.balance ?? account.currentBalance;
      return {
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        provider: account.provider,
        isManual: account.provider === 'manual',
        currentBalance: account.currentBalance,
        signedBalance: signedAmount(account.class, balance),
        currency: account.currency ?? 'USD',
        syncedAt: account.syncedAt,
        coverageStart: account.coverageStart,
        firstAsOf: first?.asOf ?? null,
        latestSnapshot: latest,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function modelFromRollupPoints(args: {
  accounts: SeriesAccount[];
  firsts: Map<string, SeriesSnapshot>;
  lasts: Map<string, SeriesSnapshot>;
  points: ChartPoint[];
  range: RangeKey;
  asOf: string;
  grain: RollupGrain;
  rollup: RollupFreshness;
}): {
  range: RangeKey;
  asOf: string;
  headline: number;
  change: number;
  changePct: number | null;
  assets: number;
  liabilities: number;
  byClass: Record<string, number>;
  points: ChartPoint[];
  coverageMarkers: Array<{ asOf: string; label: string; class: string; kind: 'account' | 'class' }>;
  accounts: PageAccount[];
  grain: RollupGrain;
  rollup: RollupFreshness;
} {
  const accounts = pageAccountsFromSeries(args.accounts, args.lasts, args.firsts);
  const classFirst = new Map<string, string>();
  for (const account of accounts) {
    if (!account.firstAsOf) continue;
    const existing = classFirst.get(account.class);
    if (!existing || account.firstAsOf < existing) classFirst.set(account.class, account.firstAsOf);
  }
  const coverageMarkers = [...classFirst.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([className, asOf]) => ({
      asOf,
      label: className,
      class: className,
      kind: 'class' as const,
    }));

  const points = args.points;
  const last = points[points.length - 1];
  const first = points[0];
  const headline = last?.total ?? 0;
  const change = last && first ? roundMoney(last.total - first.total) : 0;
  const changePct = last && first && first.total !== 0 ? last.total / first.total - 1 : null;
  const byClass = last?.byClass ?? {};
  let assets = 0;
  let liabilities = 0;
  for (const [className, amount] of Object.entries(byClass)) {
    if (className === 'credit' || className === 'liability' || amount < 0) liabilities += amount;
    else assets += amount;
  }
  return {
    range: args.range,
    asOf: args.asOf,
    headline,
    change,
    changePct,
    assets: roundMoney(assets),
    liabilities: roundMoney(liabilities),
    byClass,
    points,
    coverageMarkers,
    accounts,
    grain: args.grain,
    rollup: args.rollup,
  };
}

export function chartPointsFromTotals(
  rows: Array<{ asOf: string; value: number; interpolated: boolean; byClass?: Record<string, number> }>,
): ChartPoint[] {
  return rows.map((row) => ({
    asOf: row.asOf,
    total: row.value,
    interpolated: row.interpolated,
    byClass: row.byClass ?? {},
  }));
}

export function valuesFromAccountRollups(
  dates: string[],
  rows: Array<{ asOf: string; value: number }>,
): Array<number | null> {
  const ordered = [...rows].sort((a, b) => a.asOf.localeCompare(b.asOf));
  return dates.map((date) => {
    let found: number | null = null;
    for (const row of ordered) {
      if (row.asOf <= date) found = row.value;
      else break;
    }
    if (found == null) return null;
    const first = ordered[0];
    if (first && date < first.asOf) return null;
    return found;
  });
}

export function sameByClass(
  left?: Record<string, number>,
  right?: Record<string, number>,
): boolean {
  const a = left ?? {};
  const b = right ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (roundMoney(a[key] ?? 0) !== roundMoney(b[key] ?? 0)) return false;
  }
  return true;
}

export function rollupUnchanged(
  existing: {
    value: number;
    interpolated: boolean;
    byClass?: Record<string, number>;
    netInvested?: number;
    sp500Equiv?: number;
    estimated?: boolean;
  },
  next: {
    value: number;
    interpolated: boolean;
    byClass?: Record<string, number>;
    netInvested?: number;
    sp500Equiv?: number;
    estimated?: boolean;
  },
): boolean {
  return (
    existing.value === next.value &&
    existing.interpolated === next.interpolated &&
    sameByClass(existing.byClass, next.byClass) &&
    (existing.netInvested ?? null) === (next.netInvested ?? null) &&
    (existing.sp500Equiv ?? null) === (next.sp500Equiv ?? null) &&
    Boolean(existing.estimated) === Boolean(next.estimated)
  );
}

export type { AccountGroupKey };
