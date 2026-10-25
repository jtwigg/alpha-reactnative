import { httpAction, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { bearerMatches } from './secret';
import { accountDocValidator } from './validators';

export const FINANCE_OPS = [
  'upsert_accounts',
  'upsert_snapshots',
  'upsert_transactions',
  'upsert_holdings',
  'fill_gaps',
  'get_digest',
  'export_bucket',
  'list_accounts',
  'delete_accounts',
  'delete_transactions',
  'upsert_flows',
  'delete_flows',
  'upsert_returns',
  'upsert_series',
  'delete_series',
  'recompute_charts',
  'recompute_chart_scope',
  'recompute_charts_from',
  'check_chart_consistency',
] as const;

export type FinanceOp = (typeof FINANCE_OPS)[number];

export const listAccounts = internalQuery({
  args: {},
  returns: v.array(accountDocValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query('accounts').collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

type GatewayCtx = {
  runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
  runQuery: (ref: unknown, args: unknown) => Promise<unknown>;
};

export async function dispatchFinanceOp(
  ctx: GatewayCtx,
  op: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (op as FinanceOp) {
    case 'upsert_accounts':
      return await ctx.runMutation(internal.finance.ingest.upsertAccounts, {
        items: args.items,
      });
    case 'upsert_snapshots':
      return await ctx.runMutation(internal.finance.ingest.upsertSnapshots, {
        items: args.items,
      });
    case 'upsert_transactions':
      return await ctx.runMutation(internal.finance.ingest.upsertTransactions, {
        items: args.items,
      });
    case 'upsert_holdings':
      return await ctx.runMutation(internal.finance.ingest.upsertHoldings, {
        items: args.items,
      });
    case 'fill_gaps':
      return await ctx.runMutation(internal.finance.ingest.fillGaps, {
        accountId: args.accountId,
        from: args.from,
        to: args.to,
      });
    case 'get_digest':
      return await ctx.runQuery(internal.finance.sync.digest, {
        from: args.from,
        to: args.to,
        table: args.table,
        accountId: args.accountId,
        cursor: args.cursor,
        limit: args.limit,
      });
    case 'export_bucket':
      return await ctx.runQuery(internal.finance.sync.exportBucket, {
        table: args.table,
        accountId: args.accountId,
        month: args.month,
        cursor: args.cursor,
        limit: args.limit,
      });
    case 'list_accounts':
      return await ctx.runQuery(internal.finance.gateway.listAccounts, {});
    case 'delete_accounts':
      return await ctx.runMutation(internal.finance.ingest.deleteAccounts, {
        ids: args.ids,
        mergedInto: args.mergedInto,
      });
    case 'delete_transactions':
      return await ctx.runMutation(internal.finance.ingest.deleteTransactions, {
        ids: args.ids,
      });
    case 'upsert_flows':
      return await ctx.runMutation(internal.finance.ingest.upsertFlows, {
        items: args.items,
      });
    case 'delete_flows':
      return await ctx.runMutation(internal.finance.ingest.deleteFlows, {
        ids: args.ids,
      });
    case 'upsert_returns':
      return await ctx.runMutation(internal.finance.ingest.upsertReturns, {
        items: args.items,
      });
    case 'upsert_series':
      return await ctx.runMutation(internal.finance.ingest.upsertSeries, {
        items: args.items,
        replaceScope: args.replaceScope,
        replaceBatchId: args.replaceBatchId,
      });
    case 'delete_series':
      return await ctx.runMutation(internal.finance.ingest.deleteSeries, {
        scope: args.scope,
        fromDate: args.fromDate,
        toDate: args.toDate,
      });
    case 'recompute_charts':
      return await ctx.runMutation(internal.finance.serveJobs.recomputeAll, {});
    case 'recompute_chart_scope':
      return await ctx.runMutation(internal.finance.serveJobs.recomputeScope, {
        kind: args.kind,
        scopeId: args.scopeId,
      });
    case 'recompute_charts_from':
      return await ctx.runMutation(internal.finance.serveJobs.recomputeFrom, { from: args.from });
    case 'check_chart_consistency':
      return await ctx.runQuery(internal.finance.serveJobs.checkConsistency, {
        sample: args.sample,
        kind: args.kind,
        scopeId: args.scopeId,
      });
    default:
      throw new Error(`Unknown finance op: ${op}`);
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Server-to-server Convex HTTP entry. Vercel MCP calls this with
 * `Authorization: Bearer $FINANCE_SERVER_SECRET`. Not an admin/deploy key.
 *
 *   POST https://<deployment>.convex.site/finance/server
 *   { "op": "upsert_accounts", "args": { "items": [...] } }
 */
export const financeServer = httpAction(async (ctx, request) => {
  const expected = process.env.FINANCE_SERVER_SECRET;
  if (!bearerMatches(request.headers.get('authorization'), expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { op?: string; args?: Record<string, unknown> };
  try {
    body = (await request.json()) as { op?: string; args?: Record<string, unknown> };
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  if (!body.op || typeof body.op !== 'string') {
    return jsonResponse({ error: 'Missing op' }, 400);
  }

  try {
    const result = await dispatchFinanceOp(
      ctx as unknown as GatewayCtx,
      body.op,
      body.args ?? {},
    );
    return jsonResponse({ result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
