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

export type SyncRunStatus = 'running' | 'ok' | 'aborted' | 'failed';

export type SyncRunRow = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  trigger: 'cron' | 'manual';
  status: SyncRunStatus;
  abortReason: string | null;
  plaidCalls: number;
  mutations: number;
  itemsSynced: number;
  report: unknown;
};

export type SyncLogs = { syncEnabled: boolean; runs: SyncRunRow[] };

export type LogLine = { institution: string; text: string; tone: 'ok' | 'warn' | 'error' };

const RUN_STATUS_LABEL: Record<SyncRunStatus, string> = {
  running: 'Running',
  ok: 'Completed',
  aborted: 'Stopped early',
  failed: 'Failed',
};

export function runStatusLabel(status: SyncRunStatus): string {
  return RUN_STATUS_LABEL[status];
}

const ABORT_LABEL: Record<string, string> = {
  plaid_call_cap: 'Hit the per-run limit on Plaid calls.',
  mutation_cap: 'Hit the per-run limit on database writes.',
};

export function abortLabel(reason: string | null): string | null {
  if (!reason) return null;
  return ABORT_LABEL[reason] ?? `Stopped: ${reason}`;
}

export function runHeadline(run: SyncRunRow): string {
  const banks = run.itemsSynced === 1 ? '1 bank' : `${run.itemsSynced} banks`;
  const how = run.trigger === 'manual' ? 'Manual' : 'Daily';
  return `${how} · ${banks} · ${run.plaidCalls} Plaid calls · ${run.mutations} writes`;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** One plain-language line per institution in a run report (tolerates older or partial reports). */
export function itemLines(report: unknown): LogLine[] {
  const items = (report as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const institution = typeof r.institution === 'string' ? r.institution : 'Bank';
    if (typeof r.error === 'string') {
      return { institution, text: errorLabel(r.error) ?? 'Sync failed.', tone: 'error' as const };
    }
    const parts: string[] = [];
    const warnings: string[] = [];
    parts.push(`${num(r.added)} new`, `${num(r.modified)} updated`, `${num(r.removed)} removed`);
    if (num(r.deleted) > 0) parts.push(`${num(r.deleted)} deleted`);
    if (num(r.skippedAsDuplicate) > 0) parts.push(`${count(num(r.skippedAsDuplicate), 'duplicate')} skipped`);
    if (num(r.matchedToExisting) > 0) parts.push(`${count(num(r.matchedToExisting), 'account')} matched to existing`);
    if (num(r.holdings) > 0) parts.push(count(num(r.holdings), 'holding'));
    if (num(r.historyDays) > 0) parts.push(`history +${count(num(r.historyDays), 'day')}`);
    if (r.live === false) parts.push('shadow mode');

    const held = Array.isArray(r.heldForMatching) ? r.heldForMatching.length : 0;
    if (held > 0) warnings.push(`${count(held, 'account')} held back: more than one possible match`);
    const skipped = Array.isArray(r.skippedBalances) ? r.skippedBalances.length : 0;
    if (skipped > 0) warnings.push(`${count(skipped, 'balance')} not written (missing or non-USD)`);
    if (num(r.unmappedRows) > 0) warnings.push(`${count(num(r.unmappedRows), 'transaction')} skipped for unmatched accounts`);
    const findings = Array.isArray(r.findings) ? (r.findings as Array<{ type?: string }>) : [];
    const drift = findings.filter((f) => f.type === 'balance_drift').length;
    if (drift > 0) warnings.push(`${count(drift, 'account')} with a balance that does not match its transactions`);
    const gone = findings.filter((f) => f.type === 'account_disappeared').length;
    if (gone > 0) warnings.push(`${count(gone, 'account')} no longer reported by the bank`);

    return {
      institution,
      text: [parts.join(', '), ...warnings].join('. ') + '.',
      tone: warnings.length > 0 ? ('warn' as const) : ('ok' as const),
    };
  });
}

export const SETTINGS_SECTIONS: Array<{ href: string; title: string; body: string }> = [
  { href: '/connections', title: 'Connections', body: 'Linked banks, status, relink, add or remove.' },
  { href: '/sync-logs', title: 'Sync logs', body: 'What happened in each sync: what changed and what needs attention.' },
];
