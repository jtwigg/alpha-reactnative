import { afterEach, describe, expect, it, vi } from 'vitest';
import * as chat from '../convex/chat';
import { GROK_BOT_AGENT_URL, tryOpenGrokBot } from '../../reactnative/lib/grok-bot-url';

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);
const http = (fn: unknown, ctx: unknown, req: Request) =>
  (fn as unknown as { _handler: (ctx: unknown, req: Request) => Promise<Response> })._handler(ctx, req);

const identity = { subject: 'user_test', email: 'user@example.com', tokenIdentifier: 'tok|user_test' };

function fakeChatDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    users: [{ _id: 'u1', name: 'Test', tokenIdentifier: identity.tokenIdentifier }],
    chat_messages: [],
  };
  const INDEXES: Record<string, string[]> = {
    by_token: ['tokenIdentifier'],
    by_user_thread: ['userId', 'threadId'],
    by_messageId: ['messageId'],
    by_threadId: ['threadId'],
    by_parent: ['parentMessageId'],
  };
  let n = 0;
  const db = {
    query(table: string) {
      let rows = [...(tables[table] ?? [])];
      let fields: string[] = [];
      return {
        withIndex(name: string, range?: (q: unknown) => unknown) {
          fields = INDEXES[name] ?? [];
          const conds: Array<(row: Record<string, unknown>) => boolean> = [];
          const q = { eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q) };
          range?.(q);
          rows = rows.filter((row) => conds.every((cond) => cond(row)));
          return this;
        },
        order(dir: 'asc' | 'desc') {
          rows = [...rows].sort((a, b) => {
            const av = Number(a.createdAt ?? 0);
            const bv = Number(b.createdAt ?? 0);
            return dir === 'desc' ? bv - av : av - bv;
          });
          return this;
        },
        take(limit: number) {
          return rows.slice(0, limit);
        },
        async unique() {
          return rows[0] ?? null;
        },
        async collect() {
          return rows;
        },
      };
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const row = { ...doc, _id: `id_${n++}` };
      tables[table].push(row);
      return row._id;
    },
    async patch(id: string, doc: Record<string, unknown>) {
      const table = Object.keys(tables).find((name) => tables[name].some((row) => row._id === id));
      if (!table) throw new Error('missing');
      tables[table] = tables[table].map((row) => (row._id === id ? { ...row, ...doc } : row));
    },
  };
  return {
    ctx: { db, auth: { getUserIdentity: async () => identity } },
    tables,
  };
}

describe('chat webhook + reply', () => {
  const previousEmails = process.env.ALLOWED_EMAILS;
  const previousIngest = process.env.BRIEFINGS_INGEST_SECRET;

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FEEDBACK_WEBHOOK_URL;
    delete process.env.FEEDBACK_WEBHOOK_KEY;
    process.env.ALLOWED_EMAILS = previousEmails;
    process.env.BRIEFINGS_INGEST_SECRET = previousIngest;
  });

  it('builds the Assistant webhook payload without extra fields', () => {
    expect(
      chat.buildChatWebhookPayload({
        messageId: 'ask_test',
        text: 'ping',
        createdAt: 1,
      }),
    ).toEqual({
      type: 'chat',
      messageId: 'ask_test',
      threadId: 'home',
      text: 'ping',
      createdAt: 1,
    });
  });

  it('parses a reply by messageId or threadId', () => {
    expect(chat.parseChatReply({ messageId: 'ask_test', text: 'ack' })).toEqual({
      messageId: 'ask_test',
      threadId: undefined,
      text: 'ack',
    });
    expect(chat.parseChatReply({ threadId: 'home', text: 'ack' }).threadId).toBe('home');
    expect(() => chat.parseChatReply({ text: 'ack' })).toThrow(/messageId or threadId/);
    expect(() => chat.parseChatReply({ messageId: 'ask_test', text: '  ' })).toThrow(/text/);
  });

  it('forwards ask to the webhook with Bearer FEEDBACK_WEBHOOK_KEY', async () => {
    process.env.ALLOWED_EMAILS = 'user@example.com';
    process.env.FEEDBACK_WEBHOOK_URL = 'https://example.test/hook';
    process.env.FEEDBACK_WEBHOOK_KEY = 'hook-key';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { type: string; text: string; threadId: string };
      expect(body.type).toBe('chat');
      expect(body.threadId).toBe('home');
      expect(body.text).toBe('ping');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer hook-key',
      });
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctx = {
      auth: { getUserIdentity: async () => identity },
      runMutation: async (_ref: unknown, args: { text?: string; messageId?: string }) => {
        if (args.text) return { messageId: 'ask_test', threadId: 'home', createdAt: 1 };
        return null;
      },
    };
    const result = await run(chat.ask, ctx, { text: 'ping' });
    expect(result).toEqual({ ok: true, messageId: 'ask_test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call OpenAI', () => {
    const raw = `${chat.ask}`;
    expect(raw).not.toMatch(/openai|OPENAI_API_KEY|chat\/completions/i);
  });

  it('rejects reply without the ingest secret', async () => {
    process.env.BRIEFINGS_INGEST_SECRET = 'ingest-secret';
    const res = await http(
      chat.chatReply,
      { runMutation: async () => ({ ok: true, messageId: 'ask_test' }) },
      new Request('https://posh-mink-581.convex.site/chat/reply', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'ask_test', text: 'ack' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('stores a thread on chat_messages and appends the Assistant reply', async () => {
    process.env.ALLOWED_EMAILS = 'user@example.com';
    const { ctx, tables } = fakeChatDb();
    const started = (await run(chat.startAsk, ctx, { text: 'ping' })) as {
      messageId: string;
      threadId: string;
    };
    expect(started.threadId).toBe('home');
    expect(tables.chat_messages).toHaveLength(1);
    expect(tables.chat_messages[0]).toMatchObject({
      role: 'user',
      status: 'pending',
      threadId: 'home',
    });
    expect((tables.chat_messages[0] as { text: string }).text).toBe('ping');

    const applied = await run(chat.applyReply, ctx, { messageId: started.messageId, text: 'ack' });
    expect(applied).toEqual({ ok: true, messageId: started.messageId });
    expect(tables.chat_messages).toHaveLength(2);
    expect(tables.chat_messages.map((row) => row.role)).toEqual(['user', 'assistant']);

    const thread = (await run(chat.thread, ctx, {})) as Array<{ role: string; text: string }>;
    expect(thread).toHaveLength(2);
    expect(thread[0]).toMatchObject({ role: 'user', text: 'ping' });
    expect(thread[1]).toMatchObject({ role: 'assistant', text: 'ack' });

    const latest = await run(chat.latest, ctx, {});
    expect(latest).toMatchObject({
      messageId: started.messageId,
      text: 'ping',
      reply: 'ack',
      status: 'replied',
    });
  });

  it('applies a reply with the ingest secret', async () => {
    process.env.BRIEFINGS_INGEST_SECRET = 'ingest-secret';
    const runMutation = vi.fn(async () => ({ ok: true, messageId: 'ask_test' }));
    const res = await http(
      chat.chatReply,
      { runMutation },
      new Request('https://posh-mink-581.convex.site/chat/reply', {
        method: 'POST',
        headers: { Authorization: 'Bearer ingest-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'ask_test', text: 'ack' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});

describe('Grok Bot deep link', () => {
  it('targets John\'s Assistant without a native LSApplicationQueriesSchemes entry', async () => {
    expect(GROK_BOT_AGENT_URL).toBe('grokbot://app/v1/agent?id=fcff0fa9-a9cd-444b-8c28-6a5904690983');
    const openUrl = vi.fn(async () => undefined);
    expect(await tryOpenGrokBot(openUrl)).toBe('opened');
    expect(openUrl).toHaveBeenCalledWith(GROK_BOT_AGENT_URL);
    expect(
      await tryOpenGrokBot(async () => {
        throw new Error('unavailable');
      }),
    ).toBe('failed');
  });
});
