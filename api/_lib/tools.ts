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
  'flows',
  'returns',
]);

const FLOW_KIND = z.enum(['internal_transfer', 'roth_conversion', 'external']);
const TWR_WINDOW = z.enum(['3M', '6M', 'YTD', '1Y', '3Y', 'SI']);

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
  pendingTransactionId: z
    .string()
    .optional()
    .describe('On a posted row: sourceId of the pending row it replaces (same account)'),
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

export const deleteAccountsSchema = z.object({
  ids: z.array(z.string()).min(1).max(50),
  mergedInto: z.string().optional().describe('Optional account that these ids were merged into'),
});

export const deleteTransactionsSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .max(500)
    .describe('Alpha transaction ids (Convex _id) and/or source transaction ids (sourceId)'),
});

const flowItem = z.object({
  flowId: z.string(),
  accountId: z.string(),
  date: z.string().describe('YYYY-MM-DD'),
  amount: z.number().describe('Positive = into the investment account'),
  kind: FLOW_KIND,
  counterpartAccountId: z.string().optional(),
  counterpartFlowId: z.string().optional(),
  counterpartTxnId: z.string().optional(),
  evidence: z.string().optional(),
  externalToInvestable: z.boolean(),
});

const returnItem = z.object({
  scope: z
    .string()
    .describe("'account:<id>', 'total', or 'reliable_subset'"),
  window: TWR_WINDOW,
  asOf: z.string().describe('YYYY-MM-DD'),
  startDate: z.string().describe('YYYY-MM-DD'),
  cumulative: z.number(),
  annualized: z.number().nullable().optional(),
  reliable: z.boolean(),
  startOnAnchor: z.boolean(),
  flowsFullyKnown: z.boolean(),
  method: z.literal('finance.twr.v1'),
  note: z.string().optional(),
});

export const upsertFlowsSchema = z.object({
  items: z.array(flowItem).min(1).max(500),
});

export const deleteFlowsSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .max(500)
    .describe('Flow ids (Convex _id) and/or flowId'),
});

export const upsertReturnsSchema = z.object({
  items: z.array(returnItem).min(1).max(500),
});

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
        'Insert or overwrite transactions. Batch cap 500. Dedup key sourceId. CamelCase fields only. A posted (pending=false) row replaces its pending row: pendingTransactionId deletes the pending row with that sourceId on the same account; otherwise a newly inserted posted row replaces at most one pending row on the same account with the same amount, same normalized merchant/name, and date within 5 days (closest wins). Replacements are audit-logged. Returns per-row inserted/updated/unchanged plus replacedPending (with byLink/byMatch counts and replacements).',
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
        'Reconcile buckets of (table, accountId, YYYY-MM) with count, 8-decimal sum, and bucketHash (SHA-256 of sorted contentHash values joined by LF). Also returns table-level flows and returns {count, checksum} over sorted finance.v1 content hashes. Paginate with continueCursor.',
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

  tool(
    'delete_accounts',
    {
      title: 'Delete accounts',
      description:
        'Delete accounts and all of their snapshots, transactions, and holdings. Max 50 ids. Indexed batched deletes; large accounts continue on the Convex scheduler. If mergedInto is set it is recorded on the response. Returns per-table delete counts.',
      inputSchema: deleteAccountsSchema,
    },
    call('delete_accounts'),
  );

  tool(
    'delete_transactions',
    {
      title: 'Delete transactions',
      description:
        'Delete transactions by Alpha id (Convex _id) and/or sourceId. Max 500 ids. Audit-logged. Digest is computed live, so get_digest reflects the delete immediately; the response includes recomputed digest buckets for each affected (accountId, month). Returns requested, deleted, deletedRows, and notFound.',
      inputSchema: deleteTransactionsSchema,
    },
    call('delete_transactions'),
  );

  tool(
    'upsert_flows',
    {
      title: 'Upsert TWR flows',
      description:
        'Insert or overwrite cash flows used for time-weighted returns. Batch cap 500. Dedup key flowId. amount > 0 is into the investment account. kind is internal_transfer | roth_conversion | external. Returns per-row inserted/updated/unchanged.',
      inputSchema: upsertFlowsSchema,
    },
    call('upsert_flows'),
  );

  tool(
    'delete_flows',
    {
      title: 'Delete TWR flows',
      description:
        'Delete flows by Alpha id (Convex _id) and/or flowId. Max 500 ids. Audit-logged. Digest checksums are computed live.',
      inputSchema: deleteFlowsSchema,
    },
    call('delete_flows'),
  );

  tool(
    'upsert_returns',
    {
      title: 'Upsert TWR returns',
      description:
        "Insert computed time-weighted returns. Batch cap 500. Key is scope+window+asOf. For each asOf in the batch, all stored rows with that asOf are replaced by the batch items for that asOf. scope is 'account:<id>', 'total', or 'reliable_subset'. window is 3M|6M|YTD|1Y|3Y|SI. method must be finance.twr.v1.",
      inputSchema: upsertReturnsSchema,
    },
    call('upsert_returns'),
  );
}
