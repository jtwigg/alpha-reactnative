import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { briefingIngest } from '../convex/briefings/gateway';
import * as ingest from '../convex/briefings/ingest';
import { parseBriefingDay } from '../convex/briefings/payload';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/briefing-day.json'), 'utf8'),
);

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);

const INDEXES: Record<string, string[]> = {
  by_date_account: ['date', 'account'],
  by_date: ['date'],
};

function fakeMutation() {
  const tables: Record<string, Record<string, unknown>[]> = { briefings: [], briefing_audit_log: [] };
  let n = 0;
  const db = {
    query(table: string) {
      let rows = [...(tables[table] ?? [])];
      let fields: string[] = [];
      return {
        withIndex(name: string, range?: (q: unknown) => unknown) {
          fields = INDEXES[name];
          const conds: Array<(row: Record<string, unknown>) => boolean> = [];
          const q = { eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q) };
          range?.(q);
          rows = rows.filter((row) => conds.every((cond) => cond(row)));
          return this;
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
    async replace(id: string, doc: Record<string, unknown>) {
      const table = Object.keys(tables).find((name) => tables[name].some((row) => row._id === id));
      if (!table) throw new Error('missing');
      tables[table] = tables[table].map((row) => (row._id === id ? { ...doc, _id: id } : row));
    },
  };
  return { ctx: { db }, tables };
}

describe('upsertDay', () => {
  it('inserts both sections, then updates them on a re-send, and writes one audit row', async () => {
    const { ctx, tables } = fakeMutation();
    const first = (await run(ingest.upsertDay, ctx, { payload: fixture })) as {
      inserted: number;
      updated: number;
      itemCount: number;
    };
    expect(first).toMatchObject({ date: '2026-01-15', inserted: 2, updated: 0, itemCount: 2 });
    expect(tables.briefings).toHaveLength(2);
    expect(tables.briefing_audit_log).toHaveLength(1);
    expect(tables.briefing_audit_log[0]).toMatchObject({ op: 'briefings.ingest', date: '2026-01-15', count: 2 });

    const second = (await run(ingest.upsertDay, ctx, { payload: fixture })) as { inserted: number; updated: number };
    expect(second).toMatchObject({ inserted: 0, updated: 2 });
    expect(tables.briefings).toHaveLength(2);
    expect(tables.briefing_audit_log).toHaveLength(2);
  });
});

describe('POST /briefings/ingest', () => {
  const handler = (briefingIngest as unknown as { _handler: (ctx: unknown, req: Request) => Promise<Response> })._handler;

  it('rejects a missing or wrong bearer token', async () => {
    const previous = process.env.BRIEFINGS_INGEST_SECRET;
    process.env.BRIEFINGS_INGEST_SECRET = 'ingest-secret';
    try {
      const unauthorized = await handler(
        { runMutation: vi.fn() },
        new Request('https://posh-mink-581.convex.site/briefings/ingest', {
          method: 'POST',
          body: '{}',
        }),
      );
      expect(unauthorized.status).toBe(401);
      const wrong = await handler(
        { runMutation: vi.fn() },
        new Request('https://posh-mink-581.convex.site/briefings/ingest', {
          method: 'POST',
          headers: { Authorization: 'Bearer other' },
          body: '{}',
        }),
      );
      expect(wrong.status).toBe(401);
    } finally {
      process.env.BRIEFINGS_INGEST_SECRET = previous;
    }
  });

  it('returns field errors for a bad payload and does not write', async () => {
    const previous = process.env.BRIEFINGS_INGEST_SECRET;
    process.env.BRIEFINGS_INGEST_SECRET = 'ingest-secret';
    const runMutation = vi.fn();
    try {
      const response = await handler(
        { runMutation },
        new Request('https://posh-mink-581.convex.site/briefings/ingest', {
          method: 'POST',
          headers: { Authorization: 'Bearer ingest-secret', 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: 'nope' }),
        }),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { errors: { path: string }[] };
      expect(body.errors.some((error) => error.path === 'date' || error.path === 'accounts')).toBe(true);
      expect(runMutation).not.toHaveBeenCalled();
    } finally {
      process.env.BRIEFINGS_INGEST_SECRET = previous;
    }
  });

  it('upserts a valid day', async () => {
    const previous = process.env.BRIEFINGS_INGEST_SECRET;
    process.env.BRIEFINGS_INGEST_SECRET = 'ingest-secret';
    const runMutation = vi.fn(async () => ({ date: '2026-01-15', inserted: 2, updated: 0, itemCount: 2 }));
    try {
      parseBriefingDay(fixture);
      const response = await handler(
        { runMutation },
        new Request('https://posh-mink-581.convex.site/briefings/ingest', {
          method: 'POST',
          headers: { Authorization: 'Bearer ingest-secret', 'Content-Type': 'application/json' },
          body: JSON.stringify(fixture),
        }),
      );
      expect(response.status).toBe(200);
      expect(runMutation).toHaveBeenCalledTimes(1);
    } finally {
      process.env.BRIEFINGS_INGEST_SECRET = previous;
    }
  });
});
