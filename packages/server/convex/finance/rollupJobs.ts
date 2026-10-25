import { internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { groupKeyForClass } from './accountModel';
import { eachDate, parseIsoDate, todayInTimeZone } from './dates';
import {
  BENCH_SCOPE_ID,
  GLOBAL_ROLLUP_KEY,
  ROLLUP_CONSISTENCY_SAMPLE,
  ROLLUP_DELETE_BATCH,
  TOTAL_SCOPE_ID,
  accountDayValue,
  aggregateAccountDays,
  benchDays,
  coarseFromAggregates,
  compareRollupToRaw,
  decodeRebuildCursor,
  encodeRebuildCursor,
  earliestDirty,
  mergeDirtyFrom,
  mergeDiries,
  pickSampleDates,
  planRebuildSpan,
  rollupCoarse,
  rollupUnchanged,
  shouldPatchRebuildState,
  ROLLUP_DIRTY_DRAIN,
  type ComputedDay,
  type DirtyTouch,
  type RebuildCursor,
  type RollupRow,
  type RollupStateView,
} from './rollups';
import { signedAmount, type SeriesSnapshot } from './series';
import {
  carrySeriesForward,
  coarseSeries,
  seriesPointFromDoc,
  type SeriesPoint,
} from './seriesModel';
import {
  consistencyResultValidator,
  rebuildAllResultValidator,
  rebuildStepResultValidator,
} from './validators';

type DbCtx = MutationCtx | QueryCtx;

async function loadState(ctx: DbCtx): Promise<Doc<'finance_rollup_state'> | null> {
  return await ctx.db
    .query('finance_rollup_state')
    .withIndex('by_key', (q) => q.eq('key', GLOBAL_ROLLUP_KEY))
    .unique();
}

export async function getOrCreateState(ctx: MutationCtx): Promise<Doc<'finance_rollup_state'>> {
  const existing = await loadState(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert('finance_rollup_state', {
    key: GLOBAL_ROLLUP_KEY,
    version: 0,
    status: 'ready',
    updatedAt: Date.now(),
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error('finance_rollup_state insert failed');
  return row;
}

export function stateView(row: Doc<'finance_rollup_state'> | null): RollupStateView | null {
  if (!row) return null;
  return {
    dirtyFrom: row.dirtyFrom ?? null,
    rebuiltThrough: row.rebuiltThrough ?? null,
    version: row.version,
    status: row.status,
  };
}

/**
 * Ingest hot path: insert-only dirty rows + schedule a rebuild.
 * Never reads or writes `finance_rollup_state` (avoids OCC with rebuildStep).
 */
export async function markRollupsDirty(ctx: MutationCtx, dirties: DirtyTouch[]): Promise<void> {
  const incoming = mergeDiries([], dirties.filter((row) => row.accountId && row.from));
  if (incoming.length === 0) return;
  const now = Date.now();
  for (const row of incoming) {
    parseIsoDate(row.from);
    await ctx.db.insert('finance_rollup_dirty', {
      scopeKey: row.accountId,
      from: row.from,
      createdAt: now,
    });
  }
  await ctx.scheduler.runAfter(0, internal.finance.rollupJobs.rebuildStep, {});
}

/** @deprecated Use markRollupsDirty — ingest must not touch finance_rollup_state. */
export const touchRollups = markRollupsDirty;

async function peekDirty(
  ctx: MutationCtx,
  limit = ROLLUP_DIRTY_DRAIN,
): Promise<{ touches: DirtyTouch[]; ids: Array<Doc<'finance_rollup_dirty'>['_id']>; earliest: string | null }> {
  const rows = await ctx.db.query('finance_rollup_dirty').take(limit);
  const touches = mergeDiries(
    [],
    rows.map((row) => ({ accountId: row.scopeKey, from: row.from })),
  );
  return { touches, ids: rows.map((row) => row._id), earliest: earliestDirty(touches) };
}

async function deleteDirty(ctx: MutationCtx, ids: Array<Doc<'finance_rollup_dirty'>['_id']>): Promise<void> {
  for (const id of ids) await ctx.db.delete(id);
}

export async function loadRollupRange(
  ctx: DbCtx,
  grain: RollupRow['grain'],
  scopeKind: RollupRow['scopeKind'],
  scopeId: string,
  from: string,
  to: string,
  limit = 2000,
): Promise<Doc<'finance_rollups'>[]> {
  return await ctx.db
    .query('finance_rollups')
    .withIndex('by_grain_scope_asOf', (q) =>
      q
        .eq('grain', grain)
        .eq('scopeKind', scopeKind)
        .eq('scopeId', scopeId)
        .gte('asOf', from)
        .lte('asOf', to),
    )
    .take(limit);
}

export async function loadRollupStateView(ctx: DbCtx): Promise<RollupStateView | null> {
  return stateView(await loadState(ctx));
}

async function findRollup(
  ctx: DbCtx,
  grain: RollupRow['grain'],
  scopeKind: RollupRow['scopeKind'],
  scopeId: string,
  asOf: string,
): Promise<Doc<'finance_rollups'> | null> {
  return await ctx.db
    .query('finance_rollups')
    .withIndex('by_grain_scope_asOf', (q) =>
      q.eq('grain', grain).eq('scopeKind', scopeKind).eq('scopeId', scopeId).eq('asOf', asOf),
    )
    .unique();
}

async function upsertRollup(
  ctx: MutationCtx,
  row: RollupRow,
): Promise<'inserted' | 'updated' | 'unchanged'> {
  const existing = await findRollup(ctx, row.grain, row.scopeKind, row.scopeId, row.asOf);
  if (existing && rollupUnchanged(existing, row)) return 'unchanged';
  const doc = {
    grain: row.grain,
    scopeKind: row.scopeKind,
    scopeId: row.scopeId,
    asOf: row.asOf,
    value: row.value,
    interpolated: row.interpolated,
    ...(row.byClass ? { byClass: row.byClass } : {}),
    ...(row.netInvested != null ? { netInvested: row.netInvested } : {}),
    ...(row.sp500Equiv != null ? { sp500Equiv: row.sp500Equiv } : {}),
    ...(row.estimated != null ? { estimated: row.estimated } : {}),
    version: row.version,
  };
  if (existing) {
    await ctx.db.replace(existing._id, doc);
    return 'updated';
  }
  await ctx.db.insert('finance_rollups', doc);
  return 'inserted';
}

async function loadAccountSnaps(
  ctx: MutationCtx,
  accountId: string,
  from: string,
  to: string,
): Promise<SeriesSnapshot[]> {
  const prior = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId).lt('asOf', from))
    .order('desc')
    .take(1);
  const inside = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId).gte('asOf', from).lte('asOf', to))
    .take(400);
  const out: SeriesSnapshot[] = [];
  if (prior[0]) {
    out.push({
      accountId: prior[0].accountId,
      asOf: prior[0].asOf,
      balance: prior[0].balance,
      source: prior[0].source,
    });
  }
  for (const row of inside) {
    out.push({
      accountId: row.accountId,
      asOf: row.asOf,
      balance: row.balance,
      source: row.source,
    });
  }
  return out;
}

async function loadBenchBars(
  ctx: MutationCtx,
  from: string,
  to: string,
): Promise<Array<{ asOf: string; close: number }>> {
  const prior = await ctx.db
    .query('market_index_bars')
    .withIndex('by_symbol_asOf', (q) => q.eq('symbol', BENCH_SCOPE_ID).lt('asOf', from))
    .order('desc')
    .take(1);
  const inside = await ctx.db
    .query('market_index_bars')
    .withIndex('by_symbol_asOf', (q) =>
      q.eq('symbol', BENCH_SCOPE_ID).gte('asOf', from).lte('asOf', to),
    )
    .take(400);
  const out: Array<{ asOf: string; close: number }> = [];
  if (prior[0]) out.push({ asOf: prior[0].asOf, close: prior[0].close });
  for (const row of inside) out.push({ asOf: row.asOf, close: row.close });
  return out;
}

async function earliestSeriesDate(ctx: MutationCtx): Promise<string | null> {
  const first = await ctx.db.query('series').withIndex('by_date').order('asc').take(1);
  return first[0]?.date ?? null;
}

async function latestSeriesDate(ctx: MutationCtx): Promise<string | null> {
  const last = await ctx.db.query('series').withIndex('by_date').order('desc').take(1);
  return last[0]?.date ?? null;
}

function minDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function maxDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

async function earliestSnapshotDate(ctx: MutationCtx): Promise<string | null> {
  const accounts = await ctx.db.query('accounts').take(200);
  let earliest: string | null = null;
  for (const account of accounts) {
    const first = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
      .order('asc')
      .take(1);
    const asOf = first[0]?.asOf;
    if (asOf && (!earliest || asOf < earliest)) earliest = asOf;
  }
  return minDate(earliest, await earliestSeriesDate(ctx));
}

async function latestSnapshotDate(ctx: MutationCtx): Promise<string | null> {
  const accounts = await ctx.db.query('accounts').take(200);
  let latest: string | null = null;
  for (const account of accounts) {
    const last = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
      .order('desc')
      .take(1);
    const asOf = last[0]?.asOf;
    if (asOf && (!latest || asOf > latest)) latest = asOf;
  }
  return maxDate(latest, await latestSeriesDate(ctx));
}

async function listSeriesScopes(ctx: MutationCtx, accounts: Array<{ sourceId: string }>): Promise<string[]> {
  const scopes = new Set<string>(['total', 'reliable_subset']);
  for (const account of accounts) scopes.add(`account:${account.sourceId}`);
  const recent = await ctx.db.query('series').withIndex('by_date').order('desc').take(200);
  for (const row of recent) scopes.add(row.scope);
  return [...scopes].sort();
}

async function loadSeriesPoints(
  ctx: MutationCtx,
  scope: string,
  from: string,
  to: string,
): Promise<SeriesPoint[]> {
  const prior = await ctx.db
    .query('series')
    .withIndex('by_scope_date', (q) => q.eq('scope', scope).lt('date', from))
    .order('desc')
    .take(1);
  const inside = await ctx.db
    .query('series')
    .withIndex('by_scope_date', (q) => q.eq('scope', scope).gte('date', from).lte('date', to))
    .take(400);
  const out: SeriesPoint[] = [];
  if (prior[0]) out.push(seriesPointFromDoc(prior[0]));
  for (const row of inside) out.push(seriesPointFromDoc(row));
  return out;
}

function seriesDaysToComputed(points: SeriesPoint[]): ComputedDay[] {
  return points.map((point) => ({
    asOf: point.asOf,
    value: point.value,
    interpolated: point.valueInterpolated,
    netInvested: point.netInvested,
    sp500Equiv: point.sp500Equiv,
    estimated: point.estimated,
  }));
}

async function rebuildSeriesSpan(
  ctx: MutationCtx,
  start: string,
  end: string,
  version: number,
  accounts: Array<{ sourceId: string }>,
): Promise<number> {
  const scopes = await listSeriesScopes(ctx, accounts);
  const days = eachDate(start, end);
  let wrote = 0;
  for (const scope of scopes) {
    const source = await loadSeriesPoints(ctx, scope, start, end);
    if (source.length === 0) continue;
    const carried = carrySeriesForward(source, start, end, days);
    if (carried.length === 0) continue;
    const dayRows = seriesDaysToComputed(carried);
    wrote += await writeComputed(ctx, {
      grain: 'day',
      scopeKind: 'series',
      scopeId: scope,
      days: dayRows,
      version,
    });
    wrote += await writeComputed(ctx, {
      grain: 'week',
      scopeKind: 'series',
      scopeId: scope,
      days: seriesDaysToComputed(coarseSeries(carried, 'week', start, end)),
      version,
    });
    wrote += await writeComputed(ctx, {
      grain: 'month',
      scopeKind: 'series',
      scopeId: scope,
      days: seriesDaysToComputed(coarseSeries(carried, 'month', start, end)),
      version,
    });
  }
  return wrote;
}

async function writeComputed(
  ctx: MutationCtx,
  args: {
    grain: RollupRow['grain'];
    scopeKind: RollupRow['scopeKind'];
    scopeId: string;
    days: ComputedDay[];
    version: number;
    byClass?: Record<string, Record<string, number>>;
  },
): Promise<number> {
  let wrote = 0;
  for (const day of args.days) {
    const status = await upsertRollup(ctx, {
      grain: args.grain,
      scopeKind: args.scopeKind,
      scopeId: args.scopeId,
      asOf: day.asOf,
      value: day.value,
      interpolated: day.interpolated,
      byClass: args.byClass?.[day.asOf],
      netInvested: day.netInvested,
      sp500Equiv: day.sp500Equiv,
      estimated: day.estimated,
      version: args.version,
    });
    if (status !== 'unchanged') wrote += 1;
  }
  return wrote;
}

async function rebuildSpan(
  ctx: MutationCtx,
  start: string,
  end: string,
  version: number,
): Promise<number> {
  const accounts = await ctx.db.query('accounts').take(80);
  const accountDays = [];
  let wrote = 0;
  for (const account of accounts) {
    const snaps = await loadAccountSnaps(ctx, account.sourceId, start, end);
    const days = [];
    for (const day of eachDate(start, end)) {
      const hit = accountDayValue(snaps, day, {
        balance: account.currentBalance,
        asOf: end,
      });
      if (!hit) continue;
      days.push({ asOf: day, value: hit.value, interpolated: hit.interpolated });
    }
    wrote += await writeComputed(ctx, {
      grain: 'day',
      scopeKind: 'account',
      scopeId: account.sourceId,
      days,
      version,
    });
    wrote += await writeComputed(ctx, {
      grain: 'week',
      scopeKind: 'account',
      scopeId: account.sourceId,
      days: rollupCoarse(days, 'week', start, end),
      version,
    });
    wrote += await writeComputed(ctx, {
      grain: 'month',
      scopeKind: 'account',
      scopeId: account.sourceId,
      days: rollupCoarse(days, 'month', start, end),
      version,
    });
    accountDays.push({ accountId: account.sourceId, className: account.class, days });
  }

  const aggregated = aggregateAccountDays(accountDays);
  const classIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const account of accounts) {
    classIds.add(account.class);
    groupIds.add(groupKeyForClass(account.class));
  }

  const totalDays: ComputedDay[] = aggregated.map((row) => ({
    asOf: row.asOf,
    value: row.total,
    interpolated: row.interpolated,
  }));
  const byClassByDate: Record<string, Record<string, number>> = {};
  for (const row of aggregated) byClassByDate[row.asOf] = row.byClass;

  wrote += await writeComputed(ctx, {
    grain: 'day',
    scopeKind: 'total',
    scopeId: TOTAL_SCOPE_ID,
    days: totalDays,
    version,
    byClass: byClassByDate,
  });

  for (const className of classIds) {
    const days = aggregated
      .filter((row) => row.byClass[className] != null)
      .map((row) => ({
        asOf: row.asOf,
        value: row.byClass[className],
        interpolated: row.interpolated,
      }));
    wrote += await writeComputed(ctx, {
      grain: 'day',
      scopeKind: 'class',
      scopeId: className,
      days,
      version,
    });
  }
  for (const group of groupIds) {
    const days = aggregated
      .filter((row) => row.byGroup[group] != null)
      .map((row) => ({
        asOf: row.asOf,
        value: row.byGroup[group],
        interpolated: row.interpolated,
      }));
    wrote += await writeComputed(ctx, {
      grain: 'day',
      scopeKind: 'group',
      scopeId: group,
      days,
      version,
    });
  }

  for (const grain of ['week', 'month'] as const) {
    const coarse = coarseFromAggregates(aggregated, grain, start, end);
    wrote += await writeComputed(ctx, {
      grain,
      scopeKind: 'total',
      scopeId: TOTAL_SCOPE_ID,
      days: coarse.map((row) => ({
        asOf: row.asOf,
        value: row.total,
        interpolated: row.interpolated,
      })),
      version,
      byClass: Object.fromEntries(coarse.map((row) => [row.asOf, row.byClass])),
    });
    for (const className of classIds) {
      wrote += await writeComputed(ctx, {
        grain,
        scopeKind: 'class',
        scopeId: className,
        days: coarse
          .filter((row) => row.byClass[className] != null)
          .map((row) => ({
            asOf: row.asOf,
            value: row.byClass[className],
            interpolated: row.interpolated,
          })),
        version,
      });
    }
    for (const group of groupIds) {
      wrote += await writeComputed(ctx, {
        grain,
        scopeKind: 'group',
        scopeId: group,
        days: coarse
          .filter((row) => row.byGroup[group] != null)
          .map((row) => ({
            asOf: row.asOf,
            value: row.byGroup[group],
            interpolated: row.interpolated,
          })),
        version,
      });
    }
  }

  const bars = await loadBenchBars(ctx, start, end);
  const bench = benchDays(bars, start, end);
  wrote += await writeComputed(ctx, {
    grain: 'day',
    scopeKind: 'bench',
    scopeId: BENCH_SCOPE_ID,
    days: bench,
    version,
  });
  wrote += await writeComputed(ctx, {
    grain: 'week',
    scopeKind: 'bench',
    scopeId: BENCH_SCOPE_ID,
    days: rollupCoarse(bench, 'week', start, end),
    version,
  });
  wrote += await writeComputed(ctx, {
    grain: 'month',
    scopeKind: 'bench',
    scopeId: BENCH_SCOPE_ID,
    days: rollupCoarse(bench, 'month', start, end),
    version,
  });

  wrote += await rebuildSeriesSpan(ctx, start, end, version, accounts);

  return wrote;
}

/**
 * One rebuild quantum. Wipes leftover rows when asked, then rematerializes
 * day/week/month layers for a short date span and reschedules itself.
 */
export const rebuildStep = internalMutation({
  args: {
    stepId: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: rebuildStepResultValidator,
  handler: async (ctx, args) => {
    const state = await getOrCreateState(ctx);
    if (args.stepId == null && state.status === 'rebuilding' && state.cursor) {
      return {
        done: false,
        status: 'rebuilding' as const,
        wrote: 0,
        from: null,
        to: null,
        rebuiltThrough: state.rebuiltThrough ?? null,
      };
    }
    if (args.stepId != null && args.stepId !== state.version) {
      return {
        done: false,
        status: state.status,
        wrote: 0,
        from: null,
        to: null,
        rebuiltThrough: state.rebuiltThrough ?? null,
      };
    }

    const pending = await peekDirty(ctx);
    if (state.status === 'ready' && !state.dirtyFrom && !state.cursor && pending.ids.length === 0) {
      return {
        done: true,
        status: 'ready' as const,
        wrote: 0,
        from: null,
        to: null,
        rebuiltThrough: state.rebuiltThrough ?? null,
      };
    }

    const dirtyFrom = pending.earliest ? mergeDirtyFrom(state.dirtyFrom, pending.earliest) : (state.dirtyFrom ?? null);
    let cursor = decodeRebuildCursor(args.cursor) ?? decodeRebuildCursor(state.cursor);
    if (!cursor) {
      const from = dirtyFrom ?? (await earliestSnapshotDate(ctx)) ?? todayInTimeZone();
      const to = (await latestSnapshotDate(ctx)) ?? todayInTimeZone();
      cursor = {
        from,
        to: to < from ? from : to,
        day: from,
        wipe: state.status === 'pending' && !state.rebuiltThrough,
      };
    } else if (dirtyFrom && dirtyFrom < cursor.day && !cursor.wipe) {
      cursor = { ...cursor, from: dirtyFrom, day: dirtyFrom };
    }
    if (pending.ids.length > 0) await deleteDirty(ctx, pending.ids);

    const runId = args.stepId ?? state.version + 1;
    const schedule = (next: RebuildCursor) =>
      ctx.scheduler.runAfter(0, internal.finance.rollupJobs.rebuildStep, {
        stepId: runId,
        cursor: encodeRebuildCursor(next),
      });
    const patchState = async (next: {
      status: Doc<'finance_rollup_state'>['status'];
      cursor?: string;
      rebuiltThrough?: string;
      dirtyFrom?: string;
    }) => {
      await ctx.db.patch(state._id, {
        status: next.status,
        version: runId,
        cursor: next.cursor,
        rebuiltThrough: next.rebuiltThrough ?? state.rebuiltThrough,
        dirtyFrom: next.dirtyFrom,
        updatedAt: Date.now(),
      });
    };

    if (cursor.wipe) {
      const rows = await ctx.db.query('finance_rollups').take(ROLLUP_DELETE_BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      const more = rows.length >= ROLLUP_DELETE_BATCH;
      const next: RebuildCursor = more ? cursor : { ...cursor, wipe: false, day: cursor.from };
      await patchState({
        status: 'rebuilding',
        cursor: encodeRebuildCursor(next),
        dirtyFrom: dirtyFrom ?? undefined,
      });
      await schedule(next);
      return {
        done: false,
        status: 'rebuilding' as const,
        wrote: rows.length,
        from: cursor.from,
        to: cursor.to,
        rebuiltThrough: state.rebuiltThrough ?? null,
      };
    }

    const accounts = await ctx.db.query('accounts').take(80);
    const span = planRebuildSpan({
      from: cursor.from,
      to: cursor.to,
      day: cursor.day,
      accountCount: accounts.length,
    });
    const wrote = span.start <= span.end ? await rebuildSpan(ctx, span.start, span.end, state.version) : 0;

    if (span.next) {
      const next: RebuildCursor = { ...cursor, day: span.next, wipe: false };
      const persist = shouldPatchRebuildState({
        prevDay: decodeRebuildCursor(state.cursor)?.day ?? cursor.day,
        nextDay: next.day,
        prevStatus: state.status,
        nextStatus: 'rebuilding',
        prevWipe: decodeRebuildCursor(state.cursor)?.wipe ?? false,
        nextWipe: false,
        drained: pending.ids.length > 0,
        done: false,
      });
      if (persist) {
        await patchState({
          status: 'rebuilding',
          cursor: encodeRebuildCursor(next),
          rebuiltThrough: span.end,
          dirtyFrom: dirtyFrom ?? undefined,
        });
      }
      await schedule(next);
      return {
        done: false,
        status: 'rebuilding' as const,
        wrote,
        from: span.start,
        to: span.end,
        rebuiltThrough: span.end,
      };
    }

    const leftover = await peekDirty(ctx);
    if (leftover.earliest) {
      const restart: RebuildCursor = {
        from: leftover.earliest,
        to: leftover.earliest > cursor.to ? leftover.earliest : cursor.to,
        day: leftover.earliest,
        wipe: false,
      };
      await deleteDirty(ctx, leftover.ids);
      await patchState({
        status: 'rebuilding',
        cursor: encodeRebuildCursor(restart),
        rebuiltThrough: span.end,
        dirtyFrom: leftover.earliest,
      });
      await schedule(restart);
      return {
        done: false,
        status: 'rebuilding' as const,
        wrote,
        from: span.start,
        to: span.end,
        rebuiltThrough: span.end,
      };
    }

    await ctx.db.patch(state._id, {
      status: 'ready',
      dirtyFrom: undefined,
      rebuiltThrough: cursor.to,
      cursor: undefined,
      version: runId,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.finance.serveJobs.writeAffected, { from: cursor.from });
    return {
      done: true,
      status: 'ready' as const,
      wrote,
      from: span.start,
      to: span.end,
      rebuiltThrough: cursor.to,
    };
  },
});

/** Wipe + rematerialize every grain from the earliest snapshot forward. */
export const rebuildAll = internalMutation({
  args: {},
  returns: rebuildAllResultValidator,
  handler: async (ctx) => {
    const dirtyFrom = (await earliestSnapshotDate(ctx)) ?? todayInTimeZone();
    const to = (await latestSnapshotDate(ctx)) ?? todayInTimeZone();
    const state = await getOrCreateState(ctx);
    const version = state.version + 1;
    await ctx.db.patch(state._id, {
      dirtyFrom,
      rebuiltThrough: undefined,
      version,
      status: 'pending',
      cursor: encodeRebuildCursor({ from: dirtyFrom, to: to < dirtyFrom ? dirtyFrom : to, day: dirtyFrom, wipe: true }),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.finance.rollupJobs.rebuildStep, {});
    return { scheduled: true, dirtyFrom, version };
  },
});

export const checkConsistency = internalQuery({
  args: { sample: v.optional(v.number()), seed: v.optional(v.number()) },
  returns: consistencyResultValidator,
  handler: async (ctx, args) => {
    const state = await loadState(ctx);
    if (!state?.rebuiltThrough) {
      return {
        checked: 0,
        matched: 0,
        mismatches: [],
        rebuiltThrough: null,
        status: 'missing' as const,
      };
    }
    const accounts = await ctx.db.query('accounts').take(80);
    let first: string | null = null;
    let last: string | null = null;
    for (const account of accounts) {
      const earliest = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
        .order('asc')
        .take(1);
      const latest = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
        .order('desc')
        .take(1);
      if (earliest[0] && (!first || earliest[0].asOf < first)) first = earliest[0].asOf;
      if (latest[0] && (!last || latest[0].asOf > last)) last = latest[0].asOf;
    }
    if (!first || !last) {
      return {
        checked: 0,
        matched: 0,
        mismatches: [],
        rebuiltThrough: state.rebuiltThrough ?? null,
        status: state.status,
      };
    }
    const sample = Math.min(Math.max(args.sample ?? ROLLUP_CONSISTENCY_SAMPLE, 1), 40);
    const dates = pickSampleDates(first, last < state.rebuiltThrough ? last : state.rebuiltThrough, sample, args.seed);
    const mismatches: Array<{ asOf: string; ok: boolean }> = [];
    let matched = 0;
    for (const asOf of dates) {
      let raw = 0;
      let covered = 0;
      for (const account of accounts) {
        const left = await ctx.db
          .query('balance_snapshots')
          .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId).lte('asOf', asOf))
          .order('desc')
          .take(1);
        const right = await ctx.db
          .query('balance_snapshots')
          .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId).gt('asOf', asOf))
          .order('asc')
          .take(1);
        const snaps: SeriesSnapshot[] = [...left, ...right].map((row) => ({
          accountId: row.accountId,
          asOf: row.asOf,
          balance: row.balance,
          source: row.source,
        }));
        const hit = accountDayValue(snaps, asOf, {
          balance: account.currentBalance,
          asOf,
        });
        if (!hit) continue;
        covered += 1;
        raw += signedAmount(account.class, hit.value);
      }
      const rollup = await findRollup(ctx, 'day', 'total', TOTAL_SCOPE_ID, asOf);
      const ok = covered === 0 ? rollup == null : Boolean(rollup && compareRollupToRaw(rollup.value, raw));
      if (ok) matched += 1;
      else mismatches.push({ asOf, ok: false });
    }
    return {
      checked: dates.length,
      matched,
      mismatches,
      rebuiltThrough: state.rebuiltThrough ?? null,
      status: state.status,
    };
  },
});
