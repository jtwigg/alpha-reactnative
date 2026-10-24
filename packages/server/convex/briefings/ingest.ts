import { internalMutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';
import type { AccountBriefing, BriefingDay } from './payload';
import { parseBriefingDay } from './payload';
import { ingestResultValidator } from './validators';
import { v } from 'convex/values';

function itemCount(section: AccountBriefing): number {
  return section.priorities.length + section.glance.length;
}

async function upsertSection(ctx: MutationCtx, date: string, section: AccountBriefing, now: number) {
  const existing = await ctx.db
    .query('briefings')
    .withIndex('by_date_account', (q) => q.eq('date', date).eq('account', section.account))
    .unique();
  const doc = { date, ...section, updatedAt: now };
  if (existing) {
    await ctx.db.replace(existing._id, doc);
    return 'updated' as const;
  }
  await ctx.db.insert('briefings', doc);
  return 'inserted' as const;
}

/**
 * Replace both sections for one calendar day. Idempotent: a re-send
 * overwrites the stored rows for that date.
 */
export const upsertDay = internalMutation({
  args: { payload: v.any() },
  returns: ingestResultValidator,
  handler: async (ctx, { payload }) => {
    const day: BriefingDay = parseBriefingDay(payload);
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const account of ['personal', 'crankcase'] as const) {
      const status = await upsertSection(ctx, day.date, day.accounts[account], now);
      if (status === 'inserted') inserted += 1;
      else updated += 1;
    }
    const count = itemCount(day.accounts.personal) + itemCount(day.accounts.crankcase);
    await ctx.db.insert('briefing_audit_log', {
      op: 'briefings.ingest',
      at: now,
      date: day.date,
      count,
      details: { inserted, updated },
    });
    return { date: day.date, inserted, updated, itemCount: count };
  },
});
