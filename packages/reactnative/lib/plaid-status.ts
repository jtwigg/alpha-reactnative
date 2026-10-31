export type PlaidItemStatus = 'active' | 'needs_relink' | 'paused';

export type PlaidAccountSummary = {
  accountId: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
};

export type PlaidConnection = {
  plaidItemId: string;
  institutionName: string;
  status: PlaidItemStatus;
  live: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  accounts: PlaidAccountSummary[];
};

export type PlaidOverview = {
  items: PlaidConnection[];
  openDeletionProposals: number;
};

/**
 * Home banner copy. Attention items win; otherwise the banner stays as the
 * entry point to Connections ("Link a bank" when empty, a count when healthy).
 * Null only while the overview is still loading.
 */
export function plaidBannerLabel(overview: PlaidOverview | null | undefined): string | null {
  if (!overview) return null;
  const relink = overview.items.filter((item) => item.status === 'needs_relink').length;
  const paused = overview.items.filter((item) => item.status === 'paused').length;
  const parts: string[] = [];
  if (relink > 0) parts.push(relink === 1 ? '1 bank needs relink' : `${relink} banks need relink`);
  if (paused > 0) parts.push(paused === 1 ? '1 bank paused' : `${paused} banks paused`);
  if (overview.openDeletionProposals > 0) {
    parts.push(
      overview.openDeletionProposals === 1
        ? '1 deletion to review'
        : `${overview.openDeletionProposals} deletions to review`,
    );
  }
  if (parts.length > 0) return parts.join(' · ');
  const count = overview.items.length;
  if (count === 0) return 'Link a bank';
  return count === 1 ? '1 bank connected' : `${count} banks connected`;
}

export function plaidStatusLabel(item: Pick<PlaidConnection, 'status' | 'live'>): string {
  if (item.status === 'needs_relink') return 'Needs relink';
  if (item.status === 'paused') return 'Paused';
  return item.live ? 'Syncing' : 'Shadow mode';
}

export function lastSyncedLabel(at: number | null, now: number = Date.now()): string {
  if (at == null) return 'Not synced yet';
  const hours = Math.floor((now - at) / 3_600_000);
  if (hours < 1) return 'Synced just now';
  if (hours < 48) return `Synced ${hours}h ago`;
  return `Synced ${Math.floor(hours / 24)}d ago`;
}

/** "Checking ••1234", or just the name when Plaid gave no mask. */
export function accountLabel(account: Pick<PlaidAccountSummary, 'name' | 'mask'>): string {
  return account.mask ? `${account.name} ••${account.mask}` : account.name;
}

/** Plain-language reason for a stored sync error code. */
export function errorLabel(code: string | null): string | null {
  if (!code) return null;
  if (code === 'ITEM_LOGIN_REQUIRED') return 'Sign-in expired. Relink to resume syncing.';
  if (code === 'sync_failed') return 'Last sync failed. It will retry on the next run.';
  return `Last sync failed (${code}).`;
}

export const STATUS_HELP: Array<{ label: string; body: string }> = [
  { label: 'Shadow mode', body: 'Plaid is fetching data but nothing is written to your finances yet.' },
  { label: 'Syncing', body: 'Balances, transactions and holdings update once a day.' },
  { label: 'Needs relink', body: 'The bank asked you to sign in again. Tap Relink; history is kept.' },
  { label: 'Paused', body: 'Three syncs in a row failed, so syncing stopped. Relink to try again.' },
];
