import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { evaluateAllowlist, requireAllowedIdentity } from '../allowlist';
import { daysBetween, isIsoDate } from './dates';
import {
  BENCHMARKS,
  BENCHMARK_STALE_MS,
  DAILY_BENCHMARK_SPAN_DAYS,
  DEFAULT_BENCHMARK,
  parseStooqCsv,
  sampleBenchmarkDates,
  stooqDailyUrl,
  type BenchmarkId,
} from './benchmarks';

const UPSERT_BATCH = 400;
const SERIES_CAP = 2000;

export const upsertBars = internalMutation({
  args: {
    symbol: v.string(),
    source: v.string(),
    bars: v.array(v.object({ asOf: v.string(), close: v.number() })),
  },
  returns: v.object({ inserted: v.number(), unchanged: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let unchanged = 0;
    const now = Date.now();
    for (const bar of args.bars) {
      const existing = await ctx.db
        .query('market_index_bars')
        .withIndex('by_symbol_asOf', (q) =>
          q.eq('symbol', args.symbol).eq('asOf', bar.asOf),
        )
        .unique();
      if (existing) {
        if (existing.close === bar.close) {
          unchanged += 1;
          continue;
        }
        await ctx.db.patch(existing._id, { close: bar.close, fetchedAt: now });
        inserted += 1;
        continue;
      }
      await ctx.db.insert('market_index_bars', {
        symbol: args.symbol,
        asOf: bar.asOf,
        close: bar.close,
        fetchedAt: now,
      });
      inserted += 1;
    }
    const lastAsOf = args.bars[args.bars.length - 1]?.asOf;
    const meta = await ctx.db
      .query('market_index_meta')
      .withIndex('by_symbol', (q) => q.eq('symbol', args.symbol))
      .unique();
    if (meta) {
      await ctx.db.patch(meta._id, {
        source: args.source,
        refreshedAt: now,
        lastAsOf,
      });
    } else {
      await ctx.db.insert('market_index_meta', {
        symbol: args.symbol,
        source: args.source,
        refreshedAt: now,
        lastAsOf,
      });
    }
    return { inserted, unchanged };
  },
});

export const lastAsOf = internalQuery({
  args: { symbol: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query('market_index_bars')
      .withIndex('by_symbol_asOf', (q) => q.eq('symbol', args.symbol))
      .order('desc')
      .take(1);
    return last[0]?.asOf ?? null;
  },
});

export const getMeta = internalQuery({
  args: { symbol: v.string() },
  returns: v.union(
    v.object({
      refreshedAt: v.number(),
      lastAsOf: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('market_index_meta')
      .withIndex('by_symbol', (q) => q.eq('symbol', args.symbol))
      .unique();
    if (!row) return null;
    return { refreshedAt: row.refreshedAt, lastAsOf: row.lastAsOf ?? null };
  },
});

export const series = query({
  args: {
    symbol: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
  },
  returns: v.object({
    symbol: v.string(),
    label: v.string(),
    color: v.string(),
    refreshedAt: v.union(v.number(), v.null()),
    bars: v.array(v.object({ asOf: v.string(), close: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    if (!isIsoDate(args.from) || !isIsoDate(args.to) || args.to < args.from) {
      throw new Error('Invalid market range');
    }
    const symbol = (args.symbol ?? DEFAULT_BENCHMARK) as BenchmarkId;
    const def = BENCHMARKS[symbol] ?? BENCHMARKS.SPX;
    const meta = await ctx.db
      .query('market_index_meta')
      .withIndex('by_symbol', (q) => q.eq('symbol', def.id))
      .unique();
    const before = await ctx.db
      .query('market_index_bars')
      .withIndex('by_symbol_asOf', (q) => q.eq('symbol', def.id).lt('asOf', args.from))
      .order('desc')
      .take(1);
    const span = daysBetween(args.from, args.to);
    let rows: Array<{ asOf: string; close: number }> = [];
    if (span <= DAILY_BENCHMARK_SPAN_DAYS) {
      const daily = await ctx.db
        .query('market_index_bars')
        .withIndex('by_symbol_asOf', (q) =>
          q.eq('symbol', def.id).gte('asOf', args.from).lte('asOf', args.to),
        )
        .take(SERIES_CAP);
      rows = daily.map((row) => ({ asOf: row.asOf, close: row.close }));
    } else {
      const seen = new Set<string>();
      for (const date of sampleBenchmarkDates(args.from, args.to)) {
        const hit = await ctx.db
          .query('market_index_bars')
          .withIndex('by_symbol_asOf', (q) => q.eq('symbol', def.id).lte('asOf', date))
          .order('desc')
          .take(1);
        const bar = hit[0];
        if (!bar || seen.has(bar.asOf) || bar.asOf < args.from) continue;
        seen.add(bar.asOf);
        rows.push({ asOf: bar.asOf, close: bar.close });
      }
    }
    const bars = [
      ...before.map((row) => ({ asOf: row.asOf, close: row.close })),
      ...rows,
    ];
    return {
      symbol: def.id,
      label: def.label,
      color: def.color,
      refreshedAt: meta?.refreshedAt ?? null,
      bars,
    };
  },
});

async function fetchAndCache(
  ctx: ActionCtx,
  symbol: BenchmarkId,
): Promise<{ symbol: string; fetched: number; inserted: number }> {
  const def = BENCHMARKS[symbol] ?? BENCHMARKS.SPX;
  const url = stooqDailyUrl(def.stooq);
  const response = await fetch(url, {
    headers: { Accept: 'text/csv,text/plain' },
  });
  if (!response.ok) {
    throw new Error(`Stooq ${def.stooq} HTTP ${response.status}`);
  }
  const csv = await response.text();
  const bars = parseStooqCsv(csv);
  const last = (await ctx.runQuery(internal.finance.market.lastAsOf, {
    symbol: def.id,
  })) as string | null;
  const fresh = last ? bars.filter((bar) => bar.asOf > last) : bars;
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += UPSERT_BATCH) {
    const chunk = fresh.slice(i, i + UPSERT_BATCH);
    const result = (await ctx.runMutation(internal.finance.market.upsertBars, {
      symbol: def.id,
      source: url,
      bars: chunk,
    })) as { inserted: number };
    inserted += result.inserted;
  }
  if (fresh.length === 0 && bars.length > 0) {
    await ctx.runMutation(internal.finance.market.upsertBars, {
      symbol: def.id,
      source: url,
      bars: bars.slice(-1),
    });
  }
  return { symbol: def.id, fetched: bars.length, inserted };
}

async function refreshIfStale(
  ctx: ActionCtx,
  requested?: string,
): Promise<{ refreshed: boolean; symbol: string }> {
  const symbol = (requested ?? DEFAULT_BENCHMARK) as BenchmarkId;
  const meta = await ctx.runQuery(internal.finance.market.getMeta, { symbol });
  if (meta && Date.now() - meta.refreshedAt < BENCHMARK_STALE_MS) {
    return { refreshed: false, symbol };
  }
  await fetchAndCache(ctx, symbol);
  return { refreshed: true, symbol };
}

export const refreshOne = internalAction({
  args: { symbol: v.optional(v.string()) },
  returns: v.object({
    symbol: v.string(),
    fetched: v.number(),
    inserted: v.number(),
  }),
  handler: async (ctx, args) => {
    const symbol = (args.symbol ?? DEFAULT_BENCHMARK) as BenchmarkId;
    return await fetchAndCache(ctx, symbol);
  },
});

export const refreshAll = internalAction({
  args: {},
  returns: v.array(v.object({ symbol: v.string(), fetched: v.number(), inserted: v.number() })),
  handler: async (ctx) => {
    const symbols: BenchmarkId[] = ['SPX'];
    const out = [];
    for (const symbol of symbols) {
      out.push(await fetchAndCache(ctx, symbol));
    }
    return out;
  },
});

export const ensure = action({
  args: { symbol: v.optional(v.string()) },
  returns: v.object({ refreshed: v.boolean(), symbol: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const access = evaluateAllowlist(identity);
    if (!identity || !access.allowed) {
      throw new Error('Forbidden');
    }
    return await refreshIfStale(ctx, args.symbol);
  },
});

export const ensureFresh = internalAction({
  args: { symbol: v.optional(v.string()) },
  returns: v.object({ refreshed: v.boolean(), symbol: v.string() }),
  handler: async (ctx, args) => {
    return await refreshIfStale(ctx, args.symbol);
  },
});

export { BENCHMARK_STALE_MS };
