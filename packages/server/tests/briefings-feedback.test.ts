import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as feedback from '../convex/briefings/feedback';

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);

const args = {
  deck: 'Personal',
  date: '2026-01-15',
  title: 'Example Co needs a signed form by Friday',
  sender: 'Example Sender',
  threadUrl: 'https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:1',
  threadId: '112210f47de98115',
  account: 'personal' as const,
  reaction: 'remember' as const,
  comment: '',
};

describe('briefings.feedback.send', () => {
  const previousEmails = process.env.ALLOWED_EMAILS;

  beforeEach(() => {
    process.env.ALLOWED_EMAILS = 'user@example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FEEDBACK_WEBHOOK_URL;
    delete process.env.FEEDBACK_WEBHOOK_KEY;
    process.env.ALLOWED_EMAILS = previousEmails;
  });

  it('forwards the exact webhook payload with Bearer FEEDBACK_WEBHOOK_KEY', async () => {
    process.env.FEEDBACK_WEBHOOK_URL = 'https://example.test/hook';
    process.env.FEEDBACK_WEBHOOK_KEY = 'hook-key';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { source: string; itemId: string; at: string };
      expect(body.source).toBe('email-briefing-deck');
      expect(body.itemId).toBe('2026-01-15-personal-112210f47de98115');
      expect(typeof body.at).toBe('string');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer hook-key',
      });
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await run(
      feedback.send,
      { auth: { getUserIdentity: async () => ({ subject: 'user_test', email: 'user@example.com' }) } },
      args,
    );
    expect(result).toEqual({ ok: true, upstream: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/hook');
  });

  it('does not forward when the caller is not allowlisted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      run(feedback.send, { auth: { getUserIdentity: async () => ({ subject: 'user_other' }) } }, args),
    ).rejects.toThrow(/Forbidden/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns not configured without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await run(
      feedback.send,
      { auth: { getUserIdentity: async () => ({ subject: 'user_test', email: 'user@example.com' }) } },
      args,
    );
    expect(result).toEqual({ ok: false, error: 'not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
