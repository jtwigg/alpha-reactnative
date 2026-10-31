import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import type { ActionCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { PlaidError, plaidPost } from './client';
import { decryptToken } from './crypto';
import {
  SYNC_CAPS,
  budgetExceeded,
  contentKey,
  defaultAccountSourceId,
  dropAlreadyStored,
  isLoginRequired,
  mapAccount,
  mapHolding,
  mapTransaction,
  newBudget,
  noProgress,
  type PlaidAccount,
  type PlaidHolding,
  type PlaidSecurity,
  type PlaidTransaction,
  type SyncBudget,
} from './model';

type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
};

type ItemReport = {
  institution: string;
  live: boolean;
  accounts: number;
  added: number;
  modified: number;
  removed: number;
  skippedAsDuplicate: number;
  holdings: number;
  error?: string;
};

type StoredTxn = {
  sourceId: string;
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchant?: string;
};

class CapReached extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function plaid<T>(budget: SyncBudget, path: string, body: Record<string, unknown>): Promise<T> {
  const reason = budgetExceeded(budget);
  if (reason) throw new CapReached(reason);
  budget.plaidCalls += 1;
  return plaidPost<T>(path, body);
}

async function mutate<A, R>(budget: SyncBudget, run: () => Promise<R>): Promise<R> {
  const reason = budgetExceeded(budget);
  if (reason) throw new CapReached(reason);
  budget.mutations += 1;
  return await run();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function syncItem(
  ctx: ActionCtx,
  budget: SyncBudget,
  item: {
    plaidItemId: string;
    institutionName?: string;
    encryptedAccessToken: string;
    cursor?: string;
    live: boolean;
    lastSyncedAt?: number;
  },
  now: number,
): Promise<ItemReport> {
  const report: ItemReport = {
    institution: item.institutionName ?? item.plaidItemId,
    live: item.live,
    accounts: 0,
    added: 0,
    modified: 0,
    removed: 0,
    skippedAsDuplicate: 0,
    holdings: 0,
  };
  const accessToken = await decryptToken(item.encryptedAccessToken, process.env.PLAID_TOKEN_KEY);

  // Cached balances only; real-time balance is billed per call and not used.
  const { accounts } = await plaid<{ accounts: PlaidAccount[] }>(budget, '/accounts/get', {
    access_token: accessToken,
  });
  report.accounts = accounts.length;

  const existingMap: Doc<'plaid_account_map'>[] = await ctx.runQuery(internal.plaid.store.accountMap, {
    plaidItemId: item.plaidItemId,
  });
  const sourceIdFor = new Map<string, string>(existingMap.map((row) => [row.plaidAccountId, row.sourceId]));
  const typeFor = new Map(accounts.map((a) => [a.account_id, a.type]));
  const entries = accounts
    .filter((a) => !sourceIdFor.has(a.account_id))
    .map((a) => ({
      plaidAccountId: a.account_id,
      plaidItemId: item.plaidItemId,
      sourceId: defaultAccountSourceId(a.account_id),
      type: a.type,
    }));
  if (item.live && entries.length > 0) {
    await mutate(budget, () => ctx.runMutation(internal.plaid.store.ensureAccountMap, { entries }));
  }
  for (const entry of entries) sourceIdFor.set(entry.plaidAccountId, entry.sourceId);

  const asOf = today(now);

  if (item.live) {
    await mutate(budget, () =>
      ctx.runMutation(internal.finance.ingest.upsertAccounts, {
        items: accounts.map((a) =>
          mapAccount(a, {
            sourceId: sourceIdFor.get(a.account_id)!,
            connectionId: item.plaidItemId,
            now,
          }),
        ),
      }),
    );
    await mutate(budget, () =>
      ctx.runMutation(internal.finance.ingest.upsertSnapshots, {
        items: accounts.map((a) => ({
          accountId: sourceIdFor.get(a.account_id)!,
          accountName: a.official_name?.trim() || a.name,
          class: mapAccount(a, { sourceId: '', connectionId: '', now }).class,
          asOf,
          balance: a.balances.current ?? 0,
          source: 'observed' as const,
          method: 'plaid.accounts_get',
        })),
      }),
    );
  }

  // Transactions: at most 3 pages of 500. Cursor is saved after each page,
  // but only for live items — shadow mode never advances it, so going live
  // starts from the beginning instead of missing rows.
  let cursor = item.cursor;
  const touchedAccounts = new Set<string>();
  for (let page = 0; page < SYNC_CAPS.maxTransactionPages; page += 1) {
    const res = await plaid<SyncPage>(budget, '/transactions/sync', {
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: SYNC_CAPS.transactionPageSize,
    });
    report.added += res.added.length;
    report.modified += res.modified.length;
    report.removed += res.removed.length;

    if (item.live) {
      const incoming = [...res.added, ...res.modified]
        .filter((t) => sourceIdFor.has(t.account_id))
        .map((t) =>
          mapTransaction(t, {
            accountSourceId: sourceIdFor.get(t.account_id)!,
            accountType: typeFor.get(t.account_id) ?? 'depository',
          }),
        );

      // Dedupe by content against rows Alpha already holds under other ids.
      const byAccount = new Map<string, typeof incoming>();
      for (const row of incoming) byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row]);
      const toWrite: typeof incoming = [];
      for (const [accountId, rows] of byAccount) {
        const dates = rows.map((r) => r.date).sort();
        const stored: StoredTxn[] = await ctx.runQuery(internal.plaid.runs.existingTransactions, {
          accountId,
          from: dates[0],
          to: dates[dates.length - 1],
        });
        const counts = new Map<string, number>();
        for (const row of stored) counts.set(contentKey(row), (counts.get(contentKey(row)) ?? 0) + 1);
        const { keep, skipped } = dropAlreadyStored(
          rows,
          counts,
          new Set(stored.map((r) => r.sourceId)),
        );
        report.skippedAsDuplicate += skipped;
        toWrite.push(...keep);
        if (keep.length > 0) touchedAccounts.add(accountId);
      }
      for (const batch of chunk(toWrite, 500)) {
        await mutate(budget, () => ctx.runMutation(internal.finance.ingest.upsertTransactions, { items: batch }));
      }
      if (res.removed.length > 0) {
        await mutate(budget, () =>
          ctx.runMutation(internal.plaid.runs.proposeDeletions, {
            transactionSourceIds: res.removed.map((r) => `plaid:${r.transaction_id}`),
            reason: 'plaid_removed',
          }),
        );
      }
      await mutate(budget, () =>
        ctx.runMutation(internal.plaid.store.patchItem, { plaidItemId: item.plaidItemId, cursor: res.next_cursor }),
      );
    }

    const stop =
      !res.has_more ||
      noProgress({
        added: res.added.length,
        modified: res.modified.length,
        removed: res.removed.length,
        prevCursor: cursor,
        nextCursor: res.next_cursor,
      });
    cursor = res.next_cursor;
    if (stop) break;
  }

  // Holdings only where the item has investment accounts. Not-ready or
  // not-consented responses are not failures.
  if (accounts.some((a) => a.type === 'investment')) {
    try {
      const res = await plaid<{ holdings: PlaidHolding[]; securities: PlaidSecurity[] }>(
        budget,
        '/investments/holdings/get',
        { access_token: accessToken },
      );
      report.holdings = res.holdings.length;
      if (item.live) {
        const securities = new Map(res.securities.map((s) => [s.security_id, s]));
        const rows = res.holdings
          .filter((h) => sourceIdFor.has(h.account_id))
          .map((h) => mapHolding(h, { accountSourceId: sourceIdFor.get(h.account_id)!, securities, asOf }));
        for (const batch of chunk(rows, 500)) {
          await mutate(budget, () => ctx.runMutation(internal.finance.ingest.upsertHoldings, { items: batch }));
        }
      }
    } catch (error) {
      const code = error instanceof PlaidError ? error.errorCode : undefined;
      const benign = ['PRODUCT_NOT_READY', 'ADDITIONAL_CONSENT_REQUIRED', 'PRODUCTS_NOT_SUPPORTED', 'NO_INVESTMENT_ACCOUNTS'];
      if (!benign.includes(code ?? '')) throw error;
    }
  }

  if (item.live) {
    // Gap fill from the last sync to today, per account.
    if (item.lastSyncedAt) {
      const from = today(item.lastSyncedAt + 86_400_000);
      if (from < asOf) {
        for (const a of accounts) {
          await mutate(budget, () =>
            ctx.runMutation(internal.finance.ingest.fillGaps, { accountId: sourceIdFor.get(a.account_id)!, from, to: asOf }),
          );
        }
      }
    }
    await mutate(budget, () =>
      ctx.runMutation(internal.plaid.store.patchItem, {
        plaidItemId: item.plaidItemId,
        lastSyncedAt: now,
        consecutiveFailures: 0,
        lastError: null,
      }),
    );
  } else {
    // Shadow mode: record that a fetch happened, change nothing else.
    await mutate(budget, () =>
      ctx.runMutation(internal.plaid.store.patchItem, {
        plaidItemId: item.plaidItemId,
        lastSyncedAt: now,
        consecutiveFailures: 0,
        lastError: null,
      }),
    );
  }
  return report;
}

type RunResult =
  | { ran: false; skipped: string | null }
  | { ran: true; status: 'ok' | 'aborted' | 'failed'; abortReason: string | undefined };

async function runSync(ctx: ActionCtx, trigger: 'cron' | 'manual'): Promise<RunResult> {
  const now = Date.now();
  const started: { runId: Id<'plaid_sync_runs'> | null; skipped: string | null } = await ctx.runMutation(
    internal.plaid.runs.startRun,
    { trigger, now },
  );
  if (!started.runId) return { ran: false, skipped: started.skipped };

  const budget = newBudget();
  const reports: ItemReport[] = [];
  let status: 'ok' | 'aborted' | 'failed' = 'ok';
  let abortReason: string | undefined;

  try {
    const allItems: Doc<'plaid_items'>[] = await ctx.runQuery(internal.plaid.store.listItems, {});
    const items = allItems
      .filter((item) => item.status === 'active')
      .slice(0, SYNC_CAPS.maxItems);

    // One item at a time. A cap aborts the whole run.
    for (const item of items) {
      try {
        reports.push(await syncItem(ctx, budget, item, now));
      } catch (error) {
        if (error instanceof CapReached) throw error;
        const code = error instanceof PlaidError ? error.errorCode : undefined;
        const failures = item.consecutiveFailures + 1;
        const nextStatus = isLoginRequired(code)
          ? ('needs_relink' as const)
          : failures >= SYNC_CAPS.maxConsecutiveFailures
            ? ('paused' as const)
            : ('active' as const);
        await ctx.runMutation(internal.plaid.store.patchItem, {
          plaidItemId: item.plaidItemId,
          status: nextStatus,
          consecutiveFailures: failures,
          lastError: code ?? 'sync_failed',
        });
        reports.push({
          institution: item.institutionName ?? item.plaidItemId,
          live: item.live,
          accounts: 0,
          added: 0,
          modified: 0,
          removed: 0,
          skippedAsDuplicate: 0,
          holdings: 0,
          error: code ?? 'sync_failed',
        });
      }
    }
    await ctx.runMutation(internal.plaid.runs.closeResolvedProposals, {});
  } catch (error) {
    if (error instanceof CapReached) {
      status = 'aborted';
      abortReason = error.reason;
    } else {
      status = 'failed';
      abortReason = error instanceof PlaidError ? error.message : 'unexpected_error';
    }
  }

  await ctx.runMutation(internal.plaid.runs.finishRun, {
    runId: started.runId,
    status,
    ...(abortReason ? { abortReason } : {}),
    plaidCalls: budget.plaidCalls,
    mutations: budget.mutations,
    itemsSynced: reports.filter((r) => !r.error).length,
    report: { items: reports },
  });
  return { ran: true, status, abortReason };
}

/** Daily cron entry. Never reschedules itself. */
export const dailySync = internalAction({
  args: {},
  handler: async (ctx): Promise<RunResult> => await runSync(ctx, 'cron'),
});

/** Manual run from the dashboard or CLI; still honours the kill switch, lock and caps. */
export const manualSync = internalAction({
  args: { trigger: v.optional(v.literal('manual')) },
  handler: async (ctx): Promise<RunResult> => await runSync(ctx, 'manual'),
});
