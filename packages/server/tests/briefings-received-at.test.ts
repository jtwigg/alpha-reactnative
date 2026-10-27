import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBriefingDay } from '../convex/briefings/payload';
import { formatReceivedAt, parseReceivedAt } from '../convex/briefings/receivedAt';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/briefing-day.json'), 'utf8'),
) as { accounts: { personal: { priorities: Array<Record<string, unknown>>; glance: Array<Record<string, unknown>> } } };

describe('parseReceivedAt', () => {
  it('keeps epoch ms and drops missing or junk values without failing ingest', () => {
    expect(parseReceivedAt(1_761_534_120_000)).toBe(1_761_534_120_000);
    expect(parseReceivedAt(1_761_534_120_000.9)).toBe(1_761_534_120_000);
    expect(parseReceivedAt('1761534120000')).toBe(1_761_534_120_000);
    expect(parseReceivedAt('2026-10-24T16:10:00.000Z')).toBe(Date.parse('2026-10-24T16:10:00.000Z'));
    expect(parseReceivedAt(undefined)).toBeUndefined();
    expect(parseReceivedAt(null)).toBeUndefined();
    expect(parseReceivedAt('')).toBeUndefined();
    expect(parseReceivedAt('not a date')).toBeUndefined();
    expect(parseReceivedAt(-1)).toBeUndefined();
  });
});

describe('formatReceivedAt', () => {
  const now = new Date(2026, 9, 27, 15, 0, 0).getTime();

  it('uses compact local labels and hides a missing stamp', () => {
    expect(formatReceivedAt(new Date(2026, 9, 27, 9, 42, 0).getTime(), now)).toBe('9:42 AM');
    expect(formatReceivedAt(new Date(2026, 9, 26, 16, 10, 0).getTime(), now)).toBe('Yesterday 4:10 PM');
    expect(formatReceivedAt(new Date(2026, 9, 24, 10, 0, 0).getTime(), now)).toBe('Oct 24');
    expect(formatReceivedAt(new Date(2025, 11, 3, 8, 0, 0).getTime(), now)).toBe('Dec 3, 2025');
    expect(formatReceivedAt(undefined, now)).toBeNull();
    expect(formatReceivedAt(0, now)).toBeNull();
  });
});

describe('parseBriefingDay receivedAt', () => {
  it('accepts existing payloads without receivedAt and keeps a supplied stamp', () => {
    const plain = parseBriefingDay(fixture);
    expect(plain.accounts.personal.priorities[0].receivedAt).toBeUndefined();

    const stamped = structuredClone(fixture);
    stamped.accounts.personal.priorities[0].receivedAt = 1_761_534_120_000;
    stamped.accounts.personal.glance[0].receivedAt = 'not a date';
    const day = parseBriefingDay(stamped);
    expect(day.accounts.personal.priorities[0].receivedAt).toBe(1_761_534_120_000);
    expect(day.accounts.personal.glance[0].receivedAt).toBeUndefined();
  });
});
