export type PlaidItemStatus = 'active' | 'needs_relink' | 'paused';

export type PlaidConnection = {
  plaidItemId: string;
  institutionName: string;
  status: PlaidItemStatus;
  live: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
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
