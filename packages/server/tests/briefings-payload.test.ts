import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BriefingPayloadError,
  briefingItemId,
  buildFeedbackPayload,
  parseBriefingDay,
  restLine,
} from '../convex/briefings/payload';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/briefing-day.json'), 'utf8'),
) as unknown;

describe('parseBriefingDay', () => {
  it('accepts the synthetic example', () => {
    const day = parseBriefingDay(fixture);
    expect(day.date).toBe('2026-01-15');
    expect(day.accounts.personal.priorities).toHaveLength(1);
    expect(day.accounts.crankcase.headline).toBe('Quiet day');
  });

  it('rejects missing accounts, bad dates, and non-https thread URLs', () => {
    expect(() => parseBriefingDay({})).toThrow(BriefingPayloadError);
    expect(() => parseBriefingDay({ date: '15-01-2026', accounts: { personal: {}, crankcase: {} } })).toThrow(
      /YYYY-MM-DD/,
    );
    const bad = structuredClone(fixture) as { accounts: { personal: { priorities: { webUrl: string }[] } } };
    bad.accounts.personal.priorities[0].webUrl = 'http://mail.google.com/x';
    expect(() => parseBriefingDay(bad)).toThrow(/https/);
  });

  it('rejects a mismatched account key and an oversized batch', () => {
    const wrong = structuredClone(fixture) as { accounts: { personal: { account: string } } };
    wrong.accounts.personal.account = 'crankcase';
    expect(() => parseBriefingDay(wrong)).toThrow(/must be "personal"/);
  });
});

describe('briefingItemId', () => {
  it('is date-account-threadId, not a card index', () => {
    expect(briefingItemId('2026-01-15', 'personal', '112210f47de98115')).toBe(
      '2026-01-15-personal-112210f47de98115',
    );
  });
});

describe('restLine', () => {
  it('matches the original restline phrasing', () => {
    const day = parseBriefingDay(fixture);
    expect(restLine(day.accounts.personal)).toBe(
      '1 priorities · 1 worth a glance · 12 other (7 promos/social · 5 newsletters)',
    );
    expect(restLine(day.accounts.crankcase)).toBe('0 priorities · 0 worth a glance · 0 other');
  });
});

describe('buildFeedbackPayload', () => {
  const base = {
    deck: 'Personal',
    date: '2026-01-15',
    title: 'Example Co needs a signed form by Friday',
    sender: 'Example Sender',
    threadUrl: 'https://mail.google.com/mail/?authuser=user@example.com#all/thread-f:1234567890123456789',
    threadId: '112210f47de98115',
    account: 'personal',
    reaction: 'remember' as const,
    comment: '',
  };

  it('forwards the email-briefings webhook shape with a stable itemId', () => {
    const payload = buildFeedbackPayload(base, '2026-01-15T15:04:05.000Z');
    expect(payload).toEqual({
      source: 'email-briefing-deck',
      deck: 'Personal',
      date: '2026-01-15',
      itemId: '2026-01-15-personal-112210f47de98115',
      title: 'Example Co needs a signed form by Friday',
      sender: 'Example Sender',
      threadUrl: base.threadUrl,
      threadId: '112210f47de98115',
      account: 'personal',
      reaction: 'remember',
      comment: '',
      at: '2026-01-15T15:04:05.000Z',
    });
  });

  it('ignores a client-supplied positional itemId', () => {
    const payload = buildFeedbackPayload({ ...base, itemId: '2026-01-15-0' }, '2026-01-15T15:04:05.000Z');
    expect(payload.itemId).toBe('2026-01-15-personal-112210f47de98115');
  });

  it('blankets a non-https threadUrl and an invalid threadId', () => {
    const payload = buildFeedbackPayload(
      { ...base, threadUrl: 'javascript:alert(1)', threadId: 'not-hex' },
      '2026-01-15T15:04:05.000Z',
    );
    expect(payload.threadUrl).toBe('');
    expect(payload.threadId).toBe('');
    expect(payload.itemId).toBe('');
  });

  it('requires archive to have a valid thread and account', () => {
    expect(() => buildFeedbackPayload({ ...base, reaction: 'archive', threadId: '', account: 'personal' })).toThrow(
      /archive needs threadId/,
    );
  });

  it('requires a comment when reaction is null', () => {
    expect(() => buildFeedbackPayload({ ...base, reaction: null, comment: '   ' })).toThrow(
      /reaction or comment/,
    );
    expect(buildFeedbackPayload({ ...base, reaction: null, comment: 'keep this' }, 't').comment).toBe('keep this');
  });

  it('rejects an unknown reaction', () => {
    expect(() => buildFeedbackPayload({ ...base, reaction: 'like' })).toThrow(/remember\|stop\|archive/);
  });
});
