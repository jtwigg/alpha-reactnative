import { v } from 'convex/values';

export const briefingAccountValidator = v.union(v.literal('personal'), v.literal('crankcase'));
export const briefingDeckNameValidator = v.union(v.literal('Personal'), v.literal('Crankcase'));

export const glanceItemValidator = v.object({
  threadId: v.string(),
  sender: v.string(),
  gist: v.string(),
  webUrl: v.string(),
  mobileUrl: v.string(),
  receivedAt: v.optional(v.number()),
});

export const priorityItemValidator = v.object({
  rank: v.number(),
  deadline: v.string(),
  threadId: v.string(),
  sender: v.string(),
  gist: v.string(),
  todo: v.string(),
  webUrl: v.string(),
  mobileUrl: v.string(),
  receivedAt: v.optional(v.number()),
});

export const restValidator = v.object({
  total: v.number(),
  breakdown: v.array(v.object({ label: v.string(), count: v.number() })),
});

export const accountBriefingValidator = v.object({
  account: briefingAccountValidator,
  deckName: briefingDeckNameValidator,
  headline: v.string(),
  sub: v.string(),
  priorityHeading: v.optional(v.string()),
  glanceHeading: v.optional(v.string()),
  priorities: v.array(priorityItemValidator),
  glance: v.array(glanceItemValidator),
  rest: restValidator,
});

export const briefingDayValidator = v.object({
  date: v.string(),
  personal: accountBriefingValidator,
  crankcase: accountBriefingValidator,
});

export const listDatesRowValidator = v.object({
  date: v.string(),
  personalPriorities: v.number(),
  crankcasePriorities: v.number(),
  personalGlance: v.number(),
  crankcaseGlance: v.number(),
});

export const ingestResultValidator = v.object({
  date: v.string(),
  inserted: v.number(),
  updated: v.number(),
  itemCount: v.number(),
});

export const feedbackArgsValidator = v.object({
  deck: v.string(),
  date: v.string(),
  title: v.string(),
  sender: v.string(),
  threadUrl: v.string(),
  threadId: v.string(),
  account: briefingAccountValidator,
  reaction: v.union(
    v.literal('remember'),
    v.literal('stop'),
    v.literal('archive'),
    v.null(),
  ),
  comment: v.string(),
});

export const feedbackResultValidator = v.object({
  ok: v.boolean(),
  upstream: v.optional(v.number()),
  error: v.optional(v.string()),
});
