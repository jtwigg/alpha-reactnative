/**
 * Deterministic reconciliation for Plaid data. Pure functions only: every
 * decision that affects transactions, balances or net worth lives here so it
 * can be tested exhaustively without a Plaid account or a database.
 *
 * Plaid conventions this relies on:
 *  - transaction `amount` > 0 means money OUT of the account (debit);
 *  - a posted transaction replacing a pending one carries `pending_transaction_id`,
 *    and the pending id shows up in `removed` in the same or a later page;
 *  - credit/loan `balances.current` is the amount OWED (positive).
 */
import { addDays, daysBetween } from '../finance/dates';
import {
  contentKey,
  dropAlreadyStored,
  mapTransaction,
  type PlaidAccount,
  type PlaidTransaction,
} from './model';

const CENTS = 100;

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * CENTS) / CENTS;
}

// ── Balances ────────────────────────────────────────────────────────────────

export type BalanceCheck =
  | { ok: true; balance: number }
  | { ok: false; reason: 'balance_unavailable' | 'balance_not_finite' | 'unsupported_currency' };

/**
 * A balance may be written only if Plaid actually reported one in USD. A null
 * balance must never become 0, and a foreign or unofficial currency (crypto)
 * must never be summed into a USD net worth as if it were dollars.
 */
export function checkAccountBalance(account: PlaidAccount): BalanceCheck {
  const current = account.balances.current;
  if (current == null) return { ok: false, reason: 'balance_unavailable' };
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return { ok: false, reason: 'balance_not_finite' };
  }
  const iso = account.balances.iso_currency_code;
  const unofficial = account.balances.unofficial_currency_code;
  if (unofficial || (iso && iso.toUpperCase() !== 'USD')) {
    return { ok: false, reason: 'unsupported_currency' };
  }
  return { ok: true, balance: roundCents(current) };
}

export type DriftResult =
  | { status: 'skipped'; reason: 'investment' | 'no_baseline' | 'no_elapsed_time' }
  | { status: 'ok' | 'drift'; expectedDelta: number; actualDelta: number; diff: number };

/**
 * Compares the balance change since the last snapshot with the sum of posted
 * transactions in the same window. Cash: change = -sum(amount). Liability
 * (amount owed): change = +sum(amount). Investments move with markets, so they
 * are not checked. Pending transactions are excluded because they do not
 * affect the posted balance. Report-only: it never changes data.
 */
export function checkBalanceDrift(args: {
  accountClass: string;
  previous: { asOf: string; balance: number } | null;
  current: { asOf: string; balance: number };
  transactions: Array<{ date: string; amount: number; pending: boolean }>;
  tolerance?: number;
}): DriftResult {
  if (args.accountClass === 'investments') return { status: 'skipped', reason: 'investment' };
  if (!args.previous) return { status: 'skipped', reason: 'no_baseline' };
  if (args.previous.asOf >= args.current.asOf) return { status: 'skipped', reason: 'no_elapsed_time' };
  const outflow = args.transactions
    .filter((t) => !t.pending && t.date > args.previous!.asOf && t.date <= args.current.asOf)
    .reduce((sum, t) => sum + t.amount, 0);
  const expectedDelta = roundCents(args.accountClass === 'liability' ? outflow : -outflow);
  const actualDelta = roundCents(args.current.balance - args.previous.balance);
  const diff = roundCents(actualDelta - expectedDelta);
  const tolerance = args.tolerance ?? 0.01;
  return { status: Math.abs(diff) > tolerance ? 'drift' : 'ok', expectedDelta, actualDelta, diff };
}

// ── History ─────────────────────────────────────────────────────────────────

export type DailyBalance = { asOf: string; balance: number };

/**
 * Rebuilds end-of-day balances backwards from the latest known balance using
 * posted transactions. Cash: balance(d-1) = balance(d) + sum(amount on d).
 * Liability: balance(d-1) = balance(d) - sum(amount on d). Investments cannot
 * be rebuilt from transactions (market moves), so they return nothing.
 * Transactions dated after `asOf` or before `from` do not shift the series.
 */
export function reconstructBalances(args: {
  accountClass: string;
  balance: number;
  asOf: string;
  from: string;
  transactions: Array<{ date: string; amount: number; pending: boolean }>;
}): DailyBalance[] {
  if (args.accountClass === 'investments') return [];
  if (args.from > args.asOf) return [];
  const perDay = new Map<string, number>();
  for (const t of args.transactions) {
    if (t.pending || t.date > args.asOf || t.date < args.from) continue;
    perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.amount);
  }
  const sign = args.accountClass === 'liability' ? -1 : 1;
  const out: DailyBalance[] = [];
  let balance = roundCents(args.balance);
  const days = daysBetween(args.from, args.asOf);
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(args.asOf, -i);
    out.push({ asOf: date, balance });
    balance = roundCents(balance + sign * (perDay.get(date) ?? 0));
  }
  return out.reverse();
}

// ── Transactions ────────────────────────────────────────────────────────────

export type StoredTxn = {
  sourceId: string;
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchant?: string;
  pending?: boolean;
};

export type PlanPageResult = {
  upserts: ReturnType<typeof mapTransaction>[];
  /** Plaid-owned rows Plaid said are gone; deleted with the audited delete. */
  deletes: string[];
  skippedAsDuplicate: number;
  /** Removed ids that were pendings replaced by a posted row in the same batch. */
  replacedPendings: number;
  /** Removed ids for rows Alpha never held. */
  ignoredRemovals: number;
  /** Rows on accounts that are not mapped (held back for matching). */
  unmappedSkipped: number;
};

/**
 * Turns one /transactions/sync page into writes and deletes.
 *  - added + modified are upserted, last occurrence of an id wins (replays are idempotent);
 *  - a posted row whose `pending_transaction_id` matches a removed pending is a
 *    REPLACEMENT, not a deletion (the upsert links and replaces it);
 *  - removed ids Alpha does not hold are ignored;
 *  - removed ids re-added in the same page are kept;
 *  - removals are only ever applied to Plaid-owned rows (`plaid:` ids), so another
 *    source's rows are never deleted by Plaid;
 *  - rows already stored under another id (relink) are skipped by content,
 *    while two genuine identical purchases both survive.
 */
export function planTransactionPage(args: {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  accountSourceIds: Map<string, string>;
  accountTypes: Map<string, string>;
  stored: StoredTxn[];
}): PlanPageResult {
  let unmappedSkipped = 0;
  const lastById = new Map<string, PlaidTransaction>();
  for (const txn of [...args.added, ...args.modified]) {
    if (!args.accountSourceIds.has(txn.account_id)) {
      unmappedSkipped += 1;
      continue;
    }
    lastById.set(txn.transaction_id, txn);
  }
  const mapped = [...lastById.values()].map((txn) =>
    mapTransaction(txn, {
      accountSourceId: args.accountSourceIds.get(txn.account_id)!,
      accountType: args.accountTypes.get(txn.account_id) ?? 'depository',
    }),
  );

  const storedIds = new Set(args.stored.map((row) => row.sourceId));
  const counts = new Map<string, number>();
  for (const row of args.stored) counts.set(contentKey(row), (counts.get(contentKey(row)) ?? 0) + 1);

  // A posted row that links to a pending is a replacement, so it is never a
  // content duplicate of anything else.
  const linked = mapped.filter((row) => row.pendingTransactionId);
  const plain = mapped.filter((row) => !row.pendingTransactionId);
  const { keep, skipped } = dropAlreadyStored(plain, counts, storedIds);
  const upserts = [...keep, ...linked];

  const upsertIds = new Set(upserts.map((row) => row.sourceId));
  const replacedPendingIds = new Set(linked.map((row) => row.pendingTransactionId!));

  const deletes: string[] = [];
  let replacedPendings = 0;
  let ignoredRemovals = 0;
  for (const removed of args.removed) {
    const id = `plaid:${removed.transaction_id}`;
    if (replacedPendingIds.has(id)) {
      replacedPendings += 1;
    } else if (upsertIds.has(id)) {
      // Removed and re-added in the same page: keep the live row.
      ignoredRemovals += 1;
    } else if (!storedIds.has(id)) {
      ignoredRemovals += 1;
    } else {
      deletes.push(id);
    }
  }
  return {
    upserts,
    deletes: [...new Set(deletes)],
    skippedAsDuplicate: skipped,
    replacedPendings,
    ignoredRemovals,
    unmappedSkipped,
  };
}

/** Pending rows that never posted or got removed; report-only. */
export function stalePendingIds(
  rows: Array<{ sourceId: string; pending: boolean; date: string }>,
  today: string,
  days = 14,
): string[] {
  return rows
    .filter((row) => row.pending && daysBetween(row.date, today) > days)
    .map((row) => row.sourceId);
}

/** Accounts that vanished from, or newly appeared in, a Plaid item. Balances are kept, never zeroed. */
export function diffAccounts(
  previousIds: string[],
  currentIds: string[],
): { disappeared: string[]; appeared: string[] } {
  const prev = new Set(previousIds);
  const now = new Set(currentIds);
  return {
    disappeared: previousIds.filter((id) => !now.has(id)),
    appeared: currentIds.filter((id) => !prev.has(id)),
  };
}
