import { action, httpAction, internalMutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { requireAllowedIdentity } from './allowlist';
import { bearerMatches } from './finance/secret';
import { getCurrentUser, getCurrentUserOrThrow } from './users';
import type { Doc } from './_generated/dataModel';

export const HOME_THREAD_ID = 'home';
const THREAD_LIMIT = 80;

export type ChatWebhookPayload = {
  type: 'chat';
  messageId: string;
  threadId: string;
  text: string;
  createdAt: number;
};

export function buildChatWebhookPayload(args: {
  messageId: string;
  text: string;
  createdAt: number;
  threadId?: string;
}): ChatWebhookPayload {
  return {
    type: 'chat',
    messageId: args.messageId,
    threadId: args.threadId ?? HOME_THREAD_ID,
    text: args.text,
    createdAt: args.createdAt,
  };
}

export function parseChatReply(body: unknown): { messageId?: string; threadId?: string; text: string } {
  if (!body || typeof body !== 'object') throw new Error('Invalid JSON');
  const row = body as Record<string, unknown>;
  const text = typeof row.text === 'string' ? row.text.trim() : '';
  if (!text) throw new Error('text is required');
  const messageId = typeof row.messageId === 'string' && row.messageId.trim() ? row.messageId.trim() : undefined;
  const threadId = typeof row.threadId === 'string' && row.threadId.trim() ? row.threadId.trim() : undefined;
  if (!messageId && !threadId) throw new Error('messageId or threadId is required');
  return { messageId, threadId, text };
}

const messageDoc = v.object({
  messageId: v.string(),
  threadId: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  text: v.string(),
  status: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  createdAt: v.number(),
  parentMessageId: v.union(v.string(), v.null()),
});

const askDoc = v.object({
  messageId: v.string(),
  threadId: v.string(),
  text: v.string(),
  reply: v.union(v.string(), v.null()),
  status: v.union(v.literal('pending'), v.literal('replied'), v.literal('error')),
  createdAt: v.number(),
  repliedAt: v.union(v.number(), v.null()),
});

function publicMessage(row: Doc<'chat_messages'>) {
  return {
    messageId: row.messageId,
    threadId: row.threadId,
    role: row.role,
    text: row.text,
    status: row.status,
    createdAt: row.createdAt,
    parentMessageId: row.parentMessageId ?? null,
  };
}

export const thread = query({
  args: {},
  returns: v.array(messageDoc),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query('chat_messages')
      .withIndex('by_user_thread', (q) => q.eq('userId', user._id).eq('threadId', HOME_THREAD_ID))
      .order('desc')
      .take(THREAD_LIMIT);
    return rows.reverse().map(publicMessage);
  },
});

/** Last user turn + its reply. Kept so older clients still work. */
export const latest = query({
  args: {},
  returns: v.union(askDoc, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const rows = await ctx.db
      .query('chat_messages')
      .withIndex('by_user_thread', (q) => q.eq('userId', user._id).eq('threadId', HOME_THREAD_ID))
      .order('desc')
      .take(THREAD_LIMIT);
    const userRow = rows.find((row) => row.role === 'user');
    if (!userRow) return null;
    const reply = rows.find(
      (row) => row.role === 'assistant' && row.parentMessageId === userRow.messageId,
    );
    const status =
      userRow.status === 'error' ? 'error' : reply ? 'replied' : userRow.status === 'pending' ? 'pending' : 'replied';
    return {
      messageId: userRow.messageId,
      threadId: userRow.threadId,
      text: userRow.text,
      reply: reply?.text ?? null,
      status,
      createdAt: userRow.createdAt,
      repliedAt: reply?.createdAt ?? null,
    };
  },
});

export const startAsk = internalMutation({
  args: { text: v.string() },
  returns: v.object({ messageId: v.string(), threadId: v.string(), createdAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const trimmed = args.text.trim();
    if (!trimmed) throw new Error('Message text is required');
    if (trimmed.length > 4000) throw new Error('Message is too long');
    const createdAt = Date.now();
    const messageId = `ask_${createdAt.toString(36)}`;
    await ctx.db.insert('chat_messages', {
      userId: user._id,
      messageId,
      threadId: HOME_THREAD_ID,
      role: 'user',
      text: trimmed,
      status: 'pending',
      createdAt,
    });
    return { messageId, threadId: HOME_THREAD_ID, createdAt };
  },
});

export const applyReply = internalMutation({
  args: {
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.object({ ok: v.boolean(), messageId: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return { ok: false, messageId: null };
    let userRow: Doc<'chat_messages'> | null = args.messageId
      ? await ctx.db
          .query('chat_messages')
          .withIndex('by_messageId', (q) => q.eq('messageId', args.messageId!))
          .unique()
      : null;
    if (userRow && userRow.role !== 'user') userRow = null;
    if (!userRow && args.threadId) {
      const matches = await ctx.db
        .query('chat_messages')
        .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId!))
        .order('desc')
        .take(40);
      userRow = matches.find((row) => row.role === 'user' && row.status === 'pending') ?? null;
      if (!userRow) userRow = matches.find((row) => row.role === 'user') ?? null;
    }
    if (!userRow) return { ok: false, messageId: null };
    const createdAt = Date.now();
    await ctx.db.insert('chat_messages', {
      userId: userRow.userId,
      messageId: `reply_${createdAt.toString(36)}`,
      threadId: userRow.threadId,
      role: 'assistant',
      text,
      status: 'complete',
      createdAt,
      parentMessageId: userRow.messageId,
    });
    if (userRow.status !== 'complete') {
      await ctx.db.patch(userRow._id, { status: 'complete' });
    }
    return { ok: true, messageId: userRow.messageId };
  },
});

export const markError = internalMutation({
  args: { messageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('chat_messages')
      .withIndex('by_messageId', (q) => q.eq('messageId', args.messageId))
      .unique();
    if (row && row.role === 'user' && row.status === 'pending') {
      await ctx.db.patch(row._id, { status: 'error' });
    }
    return null;
  },
});

/** Store the user message, then POST it to Assistant. No OpenAI. Never log `text`. */
export const ask = action({
  args: { text: v.string() },
  returns: v.object({
    ok: v.boolean(),
    messageId: v.union(v.string(), v.null()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const started = await ctx.runMutation(internal.chat.startAsk, { text: args.text });
    const url = process.env.FEEDBACK_WEBHOOK_URL;
    const key = process.env.FEEDBACK_WEBHOOK_KEY;
    if (!url || !key) {
      await ctx.runMutation(internal.chat.markError, { messageId: started.messageId });
      return { ok: false, messageId: started.messageId, error: 'not configured' };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(
          buildChatWebhookPayload({
            messageId: started.messageId,
            threadId: started.threadId,
            text: args.text.trim(),
            createdAt: started.createdAt,
          }),
        ),
      });
      if (response.ok) return { ok: true, messageId: started.messageId };
      await ctx.runMutation(internal.chat.markError, { messageId: started.messageId });
      return { ok: false, messageId: started.messageId, error: 'upstream' };
    } catch {
      await ctx.runMutation(internal.chat.markError, { messageId: started.messageId });
      return { ok: false, messageId: started.messageId, error: 'forward failed' };
    }
  },
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Assistant posts the reply.
 *
 *   POST https://<deployment>.convex.site/chat/reply
 *   Authorization: Bearer $BRIEFINGS_INGEST_SECRET
 *   { "messageId": "ask_…", "text": "…" }
 */
export const chatReply = httpAction(async (ctx, request) => {
  const expected = process.env.BRIEFINGS_INGEST_SECRET;
  if (!expected) return jsonResponse({ error: 'BRIEFINGS_INGEST_SECRET is not set' }, 500);
  if (!bearerMatches(request.headers.get('authorization'), expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  let parsed;
  try {
    parsed = parseChatReply(body);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid body' }, 400);
  }
  const result = await ctx.runMutation(internal.chat.applyReply, parsed);
  if (!result.ok) return jsonResponse({ error: 'ask not found' }, 404);
  return jsonResponse({ result }, 200);
});
