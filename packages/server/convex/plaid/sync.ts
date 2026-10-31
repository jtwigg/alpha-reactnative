import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import type { ActionCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { PlaidError, plaidPost } from './client';
import { decryptToken } from './crypto';
import {
  SYNC_CAPS,
  accountClass,
  budgetExceeded,
  defaultAccountSourceId,
  isLoginRequired,
  mapAccount,
  matchAccounts,
  mapHolding,
  newBudget,
  noProgress,
  summarizeAccounts,
  type PlaidAccount,
  type PlaidHolding,
  type PlaidSecurity,
  type PlaidTransaction,
  type SyncBudget,
} from './model';
import {
  checkAccountBalance,
  checkBalanceDrift,
  diffAccounts,
  planTransactionPage,
  reconstructBalances,
  type StoredTxn,
} from './reconcile';

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
  matchedToExisting: number;
  heldForMatching: string[];
  deleted: number;
  unmappedRows: number;
  skippedBalances: Array<{ accountId: string; reason: string }>;
  historyDays: number;
  findings: Array<{ type: string; accountId: string; detail?: unknown }>;
  error?: string;
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
    historyBuiltAt?: number;
    accounts?: Array<{ accountId: string }>;
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
    matchedToExisting: 0,
    heldForMatching: [],
    deleted: 0,
    unmappedRows: 0,
    skippedBalances: [],
    historyDays: 0,
    findings: [],
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
  // Match unmapped Plaid accounts to accounts Alpha already holds so history is
  // kept and net worth is not double counted. Ambiguous ones are held back (not
  // written) rather than risk a duplicate.
  const unmapped = accounts.filter((a) => !sourceIdFor.has(a.account_id));
  const legacy = unmapped.length > 0 ? await ctx.runQuery(internal.plaid.store.legacyAccounts, {}) : [];
  const entries: Array<{ plaidAccountId: string; plaidItemId: string; sourceId: string; type: string }> = [];
  for (const match of matchAccounts(unmapped, legacy)) {
    const type = typeFor.get(match.plaidAccountId) ?? 'other';
    if (match.kind === 'matched') {
      report.matchedToExisting += 1;
      entries.push({ plaidAccountId: match.plaidAccountId, plaidItemId: item.plaidItemId, sourceId: match.sourceId, type });
    } else if (match.kind === 'new') {
      entries.push({
        plaidAccountId: match.plaidAccountId,
        plaidItemId: item.plaidItemId,
        sourceId: defaultAccountSourceId(match.plaidAccountId),
        type,
      });
    } else {
      report.heldForMatching.push(match.plaidAccountId);
    }
  }
  const heldIds = new Set(report.heldForMatching);
  const writable = accounts.filter((a) => !heldIds.has(a.account_id));
  // Only write a balance Plaid actually reported in USD. A missing balance is
  // never written as 0, and a foreign currency is never summed as dollars.
  const validBalance = new Map<string, number>();
  for (const a of writable) {
    const check = checkAccountBalance(a);
    if (check.ok) validBalance.set(a.account_id, check.balance);
    else report.skippedBalances.push({ accountId: a.account_id, reason: check.reason });
  }
  const balanced = writable.filter((a) => validBalance.has(a.account_id));
  const gone = diffAccounts(
    (item.accounts ?? []).map((a) => a.accountId),
    accounts.map((a) => a.account_id),
  ).disappeared;
  for (const accountId of gone) report.findings.push({ type: 'account_disappeared', accountId });
  if (item.live && entries.length > 0) {
    await mutate(budget, () => ctx.runMutation(internal.plaid.store.ensureAccountMap, { entries }));
  }
  for (const entry of entries) sourceIdFor.set(entry.plaidAccountId, entry.sourceId);

  const asOf = today(now);

  if (item.live) {
    await mutate(budget, () =>
      ctx.runMutation(internal.finance.ingest.upsertAccounts, {
        items: balanced.map((a) =>
          mapAccount(
            { ...a, balances: { ...a.balances, current: validBalance.get(a.account_id)! } },
            {
            sourceId: sourceIdFor.get(a.account_id)!,
            connectionId: item.plaidItemId,
            now,
            },
          ),
        ),
      }),
    );
    await mutate(budget, () =>
      ctx.runMutation(internal.finance.ingest.upsertSnapshots, {
        items: balanced.map((a) => ({
          accountId: sourceIdFor.get(a.account_id)!,
          accountName: a.official_name?.trim() || a.name,
          class: accountClass(a.type),
          asOf,
          balance: validBalance.get(a.account_id)!,
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
  let syncComplete = false;
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
      // Stored rows the plan needs: the date window of each touched account (for
      // content dedupe) plus any removed ids (to know whether Alpha holds them).
      const touched = new Map<string, string[]>();
      for (const t of [...res.added, ...res.modified]) {
        const sid = sourceIdFor.get(t.account_id);
        if (sid) touched.set(sid, [...(touched.get(sid) ?? []), t.date]);
      }
      const storedById = new Map<string, StoredTxn>();
      for (const [accountId, dates] of touched) {
        const sorted = dates.sort();
        const rows: StoredTxn[] = await ctx.runQuery(internal.plaid.runs.existingTransactions, {
          accountId,
          from: sorted[0],
          to: sorted[sorted.length - 1],
        });
        for (const row of rows) storedById.set(row.sourceId, row);
      }
      if (res.removed.length > 0) {
        const rows: StoredTxn[] = await ctx.runQuery(internal.plaid.runs.transactionsByIds, {
          ids: res.removed.map((r) => `plaid:${r.transaction_id}`),
        });
        for (const row of rows) storedById.set(row.sourceId, row);
      }

      const plan = planTransactionPage({
        added: res.added,
        modified: res.modified,
        removed: res.removed,
        accountSourceIds: sourceIdFor,
        accountTypes: typeFor,
        stored: [...storedById.values()],
      });
      report.skippedAsDuplicate += plan.skippedAsDuplicate;
      report.unmappedRows += plan.unmappedSkipped;
      for (const batch of chunk(plan.upserts, 500)) {
        await mutate(budget, () => ctx.runMutation(internal.finance.ingest.upsertTransactions, { items: batch }));
      }
      for (const batch of chunk(plan.deletes, 500)) {
        // Audited delete; only Plaid-owned ids ever reach here.
        await mutate(budget, () => ctx.runMutation(internal.finance.ingest.deleteTransactions, { ids: batch }));
        report.deleted += batch.length;
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
    if (!res.has_more) syncComplete = true;
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

  // Once the full transaction history is stored: check each account for
  // balance drift, and (first time only) rebuild past daily balances so net
  // worth has a history. Reconstructed days never overwrite an existing snapshot.
  let historyBuilt = false;
  if (item.live && syncComplete) {
    for (const a of balanced) {
      if (a.type === 'investment') continue;
      const sid = sourceIdFor.get(a.account_id)!;
      const cls = accountClass(a.type);
      const balance = validBalance.get(a.account_id)!;
      const ledger: {
        transactions: Array<{ date: string; amount: number; pending: boolean }>;
        previous: { asOf: string; balance: number } | null;
        snapshotDates: string[];
      } = await ctx.runQuery(internal.plaid.runs.accountLedger, { accountId: sid, before: asOf });

      const drift = checkBalanceDrift({
        accountClass: cls,
        previous: ledger.previous,
        current: { asOf, balance },
        transactions: ledger.transactions,
      });
      if (drift.status === 'drift') report.findings.push({ type: 'balance_drift', accountId: sid, detail: drift });

      if (!item.historyBuiltAt && ledger.transactions.length > 0) {
        const earliest = ledger.transactions.reduce((min, t) => (t.date < min ? t.date : min), asOf);
        const have = new Set(ledger.snapshotDates);
        const rows = reconstructBalances({
          accountClass: cls,
          balance,
          asOf,
          from: earliest,
          transactions: ledger.transactions,
        }).filter((p) => p.asOf < asOf && !have.has(p.asOf));
        for (const batch of chunk(rows, 500)) {
          await mutate(budget, () =>
            ctx.runMutation(internal.finance.ingest.upsertSnapshots, {
              items: batch.map((p) => ({
                accountId: sid,
                accountName: a.official_name?.trim() || a.name,
                class: cls,
                asOf: p.asOf,
                balance: p.balance,
                source: 'reconstructed' as const,
                method: 'plaid.reconstructed',
              })),
            }),
          );
        }
        report.historyDays += rows.length;
      }
    }
    historyBuilt = true;
  }

  if (item.live) {
    // Gap fill from the last sync to today, per account.
    if (item.lastSyncedAt) {
      const from = today(item.lastSyncedAt + 86_400_000);
      if (from < asOf) {
        for (const a of balanced) {
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
        lastError: report.heldForMatching.length > 0 ? 'account_match_ambiguous' : null,
        accounts: summarizeAccounts(accounts),
        ...(historyBuilt && !item.historyBuiltAt ? { historyBuiltAt: now } : {}),
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
        accounts: summarizeAccounts(accounts),
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
          matchedToExisting: 0,
          heldForMatching: [],
          deleted: 0,
          unmappedRows: 0,
          skippedBalances: [],
          historyDays: 0,
          findings: [],
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
