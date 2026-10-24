import { DELETE_ACCOUNT_IDS_MAX, DELETE_TRANSACTION_IDS_MAX } from './validators';

export type DeleteCounts = {
  accounts: number;
  snapshots: number;
  transactions: number;
  holdings: number;
};

export function emptyDeleteCounts(): DeleteCounts {
  return { accounts: 0, snapshots: 0, transactions: 0, holdings: 0 };
}

export function addDeleteCounts(left: DeleteCounts, right: DeleteCounts): DeleteCounts {
  return {
    accounts: left.accounts + right.accounts,
    snapshots: left.snapshots + right.snapshots,
    transactions: left.transactions + right.transactions,
    holdings: left.holdings + right.holdings,
  };
}

export function normalizeIds(ids: string[], op: string, max: number): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) {
    throw new Error(`${op}: ids is empty`);
  }
  if (unique.length > max) {
    throw new Error(`${op}: max ${max} ids`);
  }
  return unique;
}

export function normalizeDeleteIds(ids: string[]): string[] {
  return normalizeIds(ids, 'delete_accounts', DELETE_ACCOUNT_IDS_MAX);
}

export function normalizeDeleteTransactionIds(ids: string[]): string[] {
  return normalizeIds(ids, 'delete_transactions', DELETE_TRANSACTION_IDS_MAX);
}

/** Unique (accountId, YYYY-MM) transaction buckets touched by a set of rows, sorted. */
export function affectedBuckets(rows: { accountId: string; date: string }[]): { accountId: string; month: string }[] {
  const keys = new Set(rows.map((row) => `${row.accountId}\u0000${row.date.slice(0, 7)}`));
  return [...keys]
    .sort()
    .map((key) => {
      const [accountId, month] = key.split('\u0000');
      return { accountId, month };
    });
}
