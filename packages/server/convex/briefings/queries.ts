import { query } from '../_generated/server';
import { v } from 'convex/values';
import { evaluateAllowlist, requireAllowedIdentity } from '../allowlist';
import {
  accountBriefingValidator,
  listDatesRowValidator,
} from './validators';

export const isAllowed = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return evaluateAllowlist(identity).allowed;
  },
});

/** Dates newest first. Counts only — no item text. */
export const listDates = query({
  args: { refreshNonce: v.optional(v.number()) },
  returns: v.array(listDatesRowValidator),
  handler: async (ctx) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db.query('briefings').withIndex('by_date').collect();
    const byDate = new Map<
      string,
      {
        date: string;
        personalPriorities: number;
        crankcasePriorities: number;
        personalGlance: number;
        crankcaseGlance: number;
      }
    >();
    for (const row of rows) {
      const current = byDate.get(row.date) ?? {
        date: row.date,
        personalPriorities: 0,
        crankcasePriorities: 0,
        personalGlance: 0,
        crankcaseGlance: 0,
      };
      if (row.account === 'personal') {
        current.personalPriorities = row.priorities.length;
        current.personalGlance = row.glance.length;
      } else {
        current.crankcasePriorities = row.priorities.length;
        current.crankcaseGlance = row.glance.length;
      }
      byDate.set(row.date, current);
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  },
});

export const getDay = query({
  args: { date: v.string(), refreshNonce: v.optional(v.number()) },
  returns: v.object({
    date: v.string(),
    personal: v.union(accountBriefingValidator, v.null()),
    crankcase: v.union(accountBriefingValidator, v.null()),
  }),
  handler: async (ctx, { date }) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db
      .query('briefings')
      .withIndex('by_date', (q) => q.eq('date', date))
      .collect();
    const strip = (row: (typeof rows)[number] | undefined) =>
      row
        ? {
            account: row.account,
            deckName: row.deckName,
            headline: row.headline,
            sub: row.sub,
            ...(row.priorityHeading ? { priorityHeading: row.priorityHeading } : {}),
            ...(row.glanceHeading ? { glanceHeading: row.glanceHeading } : {}),
            priorities: row.priorities,
            glance: row.glance,
            rest: row.rest,
          }
        : null;
    return {
      date,
      personal: strip(rows.find((row) => row.account === 'personal')),
      crankcase: strip(rows.find((row) => row.account === 'crankcase')),
    };
  },
});
