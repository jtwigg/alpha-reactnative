import { afterEach, describe, expect, it, vi } from 'vitest';
import * as chat from '../convex/chat';
import { GROK_BOT_AGENT_URL, tryOpenGrokBot } from '../../reactnative/lib/grok-bot-url';

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);
const http = (fn: unknown, ctx: unknown, req: Request) =>
  (fn as unknown as { _handler: (ctx: unknown, req: Request) => Promise<Response> })._handler(ctx, req);

const identity = { subject: 'user_test', email: 'user@example.com', tokenIdentifier: 'tok|user_test' };

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
