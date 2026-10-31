/**
 * Pure Plaid → Alpha finance mapping. No I/O, so it is unit-testable and the
 * sync action stays a thin loop around it.
 */

export const PLAID_PROVIDER = 'plaid';

/** Hard caps per scheduled run. A run aborts when any cap is reached. */
export const SYNC_CAPS = {
  maxItems: 12,
  maxPlaidCalls: 60,
  maxMutations: 200,
  maxTransactionPages: 3,
  transactionPageSize: 500,
  /** Minimum gap between scheduled runs. */
  minHoursBetweenRuns: 20,
  /** Consecutive failures before an item is paused. */
  maxConsecutiveFailures: 3,
} as const;

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances: {
    current?: number | null;
    available?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  };
};

export type PlaidTransaction = {
  transaction_id: string;
  pending_transaction_id?: string | null;
  account_id: string;
  amount: number;
  date: string;
  pending: boolean;
  name: string;
  merchant_name?: string | null;
  personal_finance_category?: { primary?: string | null } | null;
};

export type PlaidHolding = {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_value: number;
};

export type PlaidSecurity = {
  security_id: string;
  ticker_symbol?: string | null;
  name?: string | null;
  is_cash_equivalent?: boolean | null;
};

/** Alpha account classes used by `accountModel` (cash / investments / liability / other). */
export function accountClass(type: string): string {
  switch (type) {
    case 'depository':
      return 'cash';
    case 'investment':
    case 'brokerage':
      return 'investments';
    case 'credit':
    case 'loan':
      return 'liability';
    default:
      return 'other';
  }
}

/** Stable Alpha account id for a Plaid account when no mapping row exists yet. */
export function defaultAccountSourceId(plaidAccountId: string): string {
  return `plaid:${plaidAccountId}`;
}

export function transactionKind(type: string): 'cash' | 'liability' | 'portfolio' {
  if (type === 'investment' || type === 'brokerage') return 'portfolio';
  if (type === 'credit' || type === 'loan') return 'liability';
  return 'cash';
}

export function mapAccount(
  account: PlaidAccount,
  args: { sourceId: string; connectionId: string; now: number },
) {
  const current = account.balances.current ?? 0;
  const available = account.balances.available;
  return {
    sourceId: args.sourceId,
    provider: PLAID_PROVIDER,
    connectionId: args.connectionId,
    class: accountClass(account.type),
    name: account.official_name?.trim() || account.name,
    ...(account.mask ? { mask: account.mask } : {}),
    type: account.type,
    ...(account.subtype ? { subtype: account.subtype } : {}),
    currentBalance: current,
    ...(available != null ? { availableBalance: available } : {}),
    currency: account.balances.iso_currency_code ?? 'USD',
    syncedAt: args.now,
  };
}

export function mapTransaction(
  txn: PlaidTransaction,
  args: { accountSourceId: string; accountType: string },
) {
  const merchant = txn.merchant_name?.trim();
  const category = txn.personal_finance_category?.primary?.trim();
  return {
    sourceId: `plaid:${txn.transaction_id}`,
    accountId: args.accountSourceId,
    kind: transactionKind(args.accountType),
    date: txn.date,
    // Plaid convention: positive amount = money out. `displayAmount` relies on this.
    amount: txn.amount,
    direction: txn.amount > 0 ? 'debit' : 'credit',
    name: txn.name,
    ...(merchant ? { merchant } : {}),
    ...(category ? { category } : {}),
    pending: txn.pending,
    ...(txn.pending_transaction_id
      ? { pendingTransactionId: `plaid:${txn.pending_transaction_id}` }
      : {}),
  };
}

export function mapHolding(
  holding: PlaidHolding,
  args: { accountSourceId: string; securities: Map<string, PlaidSecurity>; asOf: string },
) {
  const security = args.securities.get(holding.security_id);
  const symbol =
    security?.ticker_symbol?.trim() ||
    (security?.is_cash_equivalent ? 'CASH' : security?.name?.trim()) ||
    holding.security_id;
  return {
    accountId: args.accountSourceId,
    symbol,
    qty: holding.quantity,
    value: holding.institution_value,
    asOf: args.asOf,
  };
}

function normalizePayee(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Content key (account, date, amount, payee). Relinking an institution gives
 * new Plaid ids for rows Alpha already holds, so ids alone cannot dedupe.
 */
export function contentKey(row: {
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchant?: string;
}): string {
  const payee = normalizePayee(row.merchant || row.name);
  return `${row.accountId}|${row.date}|${Math.round(row.amount * 100)}|${payee}`;
}

/**
 * Drop incoming rows that content-match an existing Alpha row under a
 * different id. Identical rows inside one incoming batch are kept — two
 * genuine same-day, same-amount purchases must both survive — so a content
 * match only counts against rows Alpha already stored.
 *
 * `existing` maps contentKey -> number of stored rows with that key.
 */
export function dropAlreadyStored<T extends { sourceId: string; accountId: string; date: string; amount: number; name: string; merchant?: string }>(
  incoming: T[],
  existing: Map<string, number>,
  knownIds: Set<string>,
): { keep: T[]; skipped: number } {
  const remaining = new Map(existing);
  const keep: T[] = [];
  let skipped = 0;
  for (const row of incoming) {
    if (knownIds.has(row.sourceId)) {
      keep.push(row);
      continue;
    }
    const key = contentKey(row);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      skipped += 1;
      continue;
    }
    keep.push(row);
  }
  return { keep, skipped };
}

export function isLoginRequired(errorCode: string | undefined): boolean {
  return errorCode === 'ITEM_LOGIN_REQUIRED';
}

export type SyncBudget = {
  plaidCalls: number;
  mutations: number;
};

export function newBudget(): SyncBudget {
  return { plaidCalls: 0, mutations: 0 };
}

export function budgetExceeded(budget: SyncBudget): string | null {
  if (budget.plaidCalls >= SYNC_CAPS.maxPlaidCalls) return 'plaid_call_cap';
  if (budget.mutations >= SYNC_CAPS.maxMutations) return 'mutation_cap';
  return null;
}

/** A scheduled run may start only if the last run began long enough ago. */
export function runDue(lastStartedAt: number | null, now: number): boolean {
  if (lastStartedAt == null) return true;
  return now - lastStartedAt >= SYNC_CAPS.minHoursBetweenRuns * 3_600_000;
}

/** True when a page made no progress, which stops the page loop. */
export function noProgress(args: {
  added: number;
  modified: number;
  removed: number;
  prevCursor: string | undefined;
  nextCursor: string;
}): boolean {
  const empty = args.added + args.modified + args.removed === 0;
  return empty || args.prevCursor === args.nextCursor;
}

export type AccountSummary = {
  accountId: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
};

/** Display-only account list stored on the item; never includes balances. */
export function summarizeAccounts(accounts: PlaidAccount[]): AccountSummary[] {
  return accounts.map((a) => ({
    accountId: a.account_id,
    name: a.official_name?.trim() || a.name,
    ...(a.mask ? { mask: a.mask } : {}),
    type: a.type,
    ...(a.subtype ? { subtype: a.subtype } : {}),
  }));
}

export type LegacyAccount = {
  sourceId: string;
  provider: string;
  class: string;
  name: string;
  mask?: string;
};

export type AccountMatch =
  | { kind: 'matched'; plaidAccountId: string; sourceId: string; by: 'mask' | 'name' }
  | { kind: 'new'; plaidAccountId: string }
  | { kind: 'ambiguous'; plaidAccountId: string; candidates: string[] };

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Maps Plaid accounts onto accounts Alpha already holds (written earlier by the
 * Finance assistant) so history is kept and net worth is not double counted.
 * A match needs the same class plus a unique last-4 mask, or a unique exact
 * name when there is no mask. Zero candidates means a genuinely new account;
 * several mean a person must decide. Each legacy account is used at most once.
 */
export function matchAccounts(plaid: PlaidAccount[], legacy: LegacyAccount[]): AccountMatch[] {
  const pool = legacy.filter((a) => a.provider !== PLAID_PROVIDER);
  const used = new Set<string>();
  const out: AccountMatch[] = [];
  for (const account of plaid) {
    const cls = accountClass(account.type);
    const byMask = account.mask
      ? pool.filter((l) => l.class === cls && l.mask === account.mask && !used.has(l.sourceId))
      : [];
    let candidates = byMask;
    let by: 'mask' | 'name' = 'mask';
    if (candidates.length === 0) {
      const name = normalizeName(account.official_name?.trim() || account.name);
      candidates = pool.filter(
        (l) => l.class === cls && !used.has(l.sourceId) && normalizeName(l.name) === name,
      );
      by = 'name';
    }
    if (candidates.length === 1) {
      used.add(candidates[0].sourceId);
      out.push({ kind: 'matched', plaidAccountId: account.account_id, sourceId: candidates[0].sourceId, by });
    } else if (candidates.length === 0) {
      out.push({ kind: 'new', plaidAccountId: account.account_id });
    } else {
      out.push({
        kind: 'ambiguous',
        plaidAccountId: account.account_id,
        candidates: candidates.map((c) => c.sourceId),
      });
    }
  }
  return out;
}
