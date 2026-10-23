import { z } from 'zod';
import type { ConvexFinanceClient } from './convex';

const SNAPSHOT_SOURCE = z.enum([
  'manual',
  'observed',
  'reconstructed',
  'interpolated',
]);

const FINANCE_TABLE = z.enum([
  'accounts',
  'balance_snapshots',
  'transactions',
  'holdings',
]);

const accountItem = z.object({
  sourceId: z.string(),
  provider: z.string().describe('"manual" or a feed such as "plaid"'),
  connectionId: z
    .string()
    .optional()
    .describe('Required unless provider is "manual"'),
  class: z.string(),
  name: z.string(),
  mask: z.string().optional(),
  type: z.string(),
  subtype: z.string().optional(),
  currentBalance: z.number(),
  availableBalance: z.number().optional(),
  currency: z.string(),
  syncedAt: z.number().describe('Unix milliseconds'),
  coverageStart: z.string().optional().describe('YYYY-MM-DD'),
});

const snapshotItem = z.object({
  accountId: z.string(),
  accountName: z.string().optional(),
  class: z.string().optional(),
  asOf: z.string().describe('YYYY-MM-DD'),
  balance: z.number(),
  source: SNAPSHOT_SOURCE,
  method: z.string().optional(),
});

const transactionItem = z.object({
  sourceId: z.string(),
  accountId: z.string(),
  kind: z.enum(['cash', 'liability', 'portfolio']),
  date: z.string().describe('YYYY-MM-DD'),
  amount: z.number(),
  direction: z.string(),
  name: z.string(),
  merchant: z.string().optional(),
  category: z.string().optional(),
  pending: z.boolean(),
});

const holdingItem = z.object({
  accountId: z.string(),
  symbol: z.string(),
  qty: z.number(),
  value: z.number(),
  asOf: z.string().describe('YYYY-MM-DD'),
});

export const upsertAccountsSchema = z.object({
  items: z.array(accountItem).min(1).max(500),
});

export const upsertSnapshotsSchema = z.object({
  items: z.array(snapshotItem).min(1).max(500),
});

export const upsertTransactionsSchema = z.object({
  items: z.array(transactionItem).min(1).max(500),
});

export const upsertHoldingsSchema = z.object({
  items: z.array(holdingItem).min(1).max(500),
});

export const fillGapsSchema = z.object({
  accountId: z.string(),
  from: z.string().describe('YYYY-MM-DD'),
  to: z.string().describe('YYYY-MM-DD'),
});

export const getDigestSchema = z.object({
  from: z.string().optional().describe('YYYY-MM or YYYY-MM-DD'),
  to: z.string().optional().describe('YYYY-MM or YYYY-MM-DD'),
  table: FINANCE_TABLE.optional(),
  accountId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const exportBucketSchema = z.object({
  table: FINANCE_TABLE,
  accountId: z.string(),
  month: z.string().describe('YYYY-MM'),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const listAccountsSchema = z.object({});

function asText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function registerFinanceTools(
  server: { registerTool: (...args: never[]) => unknown },
  convex: ConvexFinanceClient,
) {
  const call = (op: string) => async (args: Record<string, unknown>) =>
    asText(await convex.call(op, args));
  const tool = server.registerTool.bind(server) as (
    name: string,
    config: { title: string; description: string; inputSchema: z.ZodType },
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ) => void;

  tool(
    'upsert_accounts',
    {
      title: 'Upsert accounts',
      description:
        'Insert or overwrite finance accounts. Batch cap 500. Pusher is master for sourceId. provider="manual" must omit connectionId; other providers require it. Returns per-row inserted/updated/unchanged (and skipped_lower_precedence for intra-batch duplicates).',
      inputSchema: upsertAccountsSchema,
    },
    call('upsert_accounts'),
  );

  tool(
    'upsert_snapshots',
    {
      title: 'Upsert balance snapshots',
      description:
        'Insert or overwrite balance_snapshots. Batch cap 500. Key is accountId+asOf. Pusher overwrites the stored row. Intra-batch collisions keep the highest-precedence source (manual > observed > reconstructed > interpolated). Interpolated never overwrites a non-interpolated row. Returns per-row results.',
      inputSchema: upsertSnapshotsSchema,
    },
    call('upsert_snapshots'),
  );

  tool(
    'upsert_transactions',
    {
      title: 'Upsert transactions',
      description:
        'Insert or overwrite transactions. Batch cap 500. Dedup key sourceId. CamelCase fields only. Returns per-row inserted/updated/unchanged.',
      inputSchema: upsertTransactionsSchema,
    },
    call('upsert_transactions'),
  );

  tool(
    'upsert_holdings',
    {
      title: 'Upsert holdings',
      description:
        'Insert or overwrite holdings. Batch cap 500. Key is accountId+symbol+asOf. Returns per-row inserted/updated/unchanged.',
      inputSchema: upsertHoldingsSchema,
    },
    call('upsert_holdings'),
  );

  tool(
    'fill_gaps',
    {
      title: 'Fill snapshot gaps',
      description:
        'Write daily linear interpolated snapshots between non-interpolated anchors. Interpolated rows never overwrite real rows. Write cap 800; if continueFrom is set, call again from that date. After changing real snapshots, re-run fill_gaps for that account/range.',
      inputSchema: fillGapsSchema,
    },
    call('fill_gaps'),
  );

  tool(
    'get_digest',
    {
      title: 'Get finance digest',
      description:
        'Reconcile buckets of (table, accountId, YYYY-MM) with count, 8-decimal sum, and bucketHash (SHA-256 of sorted contentHash values joined by LF). Paginate with continueCursor.',
      inputSchema: getDigestSchema,
    },
    call('get_digest'),
  );

  tool(
    'export_bucket',
    {
      title: 'Export a digest bucket',
      description:
        'Page full rows for one (table, accountId, YYYY-MM) bucket, including contentHash and updatedAt. Paginate with continueCursor (default 100, max 200).',
      inputSchema: exportBucketSchema,
    },
    call('export_bucket'),
  );

  tool(
    'list_accounts',
    {
      title: 'List accounts',
      description:
        'List stored finance accounts (sourceId, provider, class, name, balances, coverageStart, contentHash). Server-to-server; not the Clerk-gated app query.',
      inputSchema: listAccountsSchema,
    },
    call('list_accounts'),
  );
}
