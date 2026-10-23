import { DELETE_ACCOUNT_IDS_MAX } from './validators';

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

export function normalizeDeleteIds(ids: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) {
    throw new Error('delete_accounts: ids is empty');
  }
  if (unique.length > DELETE_ACCOUNT_IDS_MAX) {
    throw new Error(`delete_accounts: max ${DELETE_ACCOUNT_IDS_MAX} ids`);
  }
  return unique;
}
