import { describe, expect, it } from 'vitest';
import {
  abortLabel,
  accountLabel,
  errorLabel,
  itemLines,
  lastSyncedLabel,
  plaidBannerLabel,
  plaidStatusLabel,
  runHeadline,
  runStatusLabel,
  type PlaidConnection,
} from '../../reactnative/lib/plaid-status';

const item = (over: Partial<PlaidConnection> = {}): PlaidConnection => ({
  plaidItemId: 'i1',
  institutionName: 'Bank',
  status: 'active',
  live: false,
  lastSyncedAt: null,
  lastError: null,
  accounts: [],
  ...over,
});

describe('plaid home banner', () => {
  it('is hidden only while loading', () => {
    expect(plaidBannerLabel(undefined)).toBeNull();
  });

  it('stays as the Connections entry point when nothing needs attention', () => {
    expect(plaidBannerLabel({ items: [], openDeletionProposals: 0 })).toBe('Link a bank');
    expect(plaidBannerLabel({ items: [item()], openDeletionProposals: 0 })).toBe('1 bank connected');
    expect(plaidBannerLabel({ items: [item(), item()], openDeletionProposals: 0 })).toBe('2 banks connected');
  });

  it('combines relink, paused and deletion counts', () => {
    expect(
      plaidBannerLabel({
        items: [item({ status: 'needs_relink' }), item({ status: 'needs_relink' }), item({ status: 'paused' })],
        openDeletionProposals: 1,
      }),
    ).toBe('2 banks need relink · 1 bank paused · 1 deletion to review');
  });
});

describe('plaid labels', () => {
  it('labels status and shadow mode', () => {
    expect(plaidStatusLabel({ status: 'needs_relink', live: true })).toBe('Needs relink');
    expect(plaidStatusLabel({ status: 'active', live: false })).toBe('Shadow mode');
    expect(plaidStatusLabel({ status: 'active', live: true })).toBe('Syncing');
  });

  it('formats last sync age', () => {
    const now = 1_000_000_000_000;
    expect(lastSyncedLabel(null, now)).toBe('Not synced yet');
    expect(lastSyncedLabel(now - 30 * 60_000, now)).toBe('Synced just now');
    expect(lastSyncedLabel(now - 5 * 3_600_000, now)).toBe('Synced 5h ago');
    expect(lastSyncedLabel(now - 72 * 3_600_000, now)).toBe('Synced 3d ago');
  });
});

describe('plaid account and error labels', () => {
  it('formats accounts with an optional mask', () => {
    expect(accountLabel({ name: 'Checking', mask: '1234' })).toBe('Checking ••1234');
    expect(accountLabel({ name: 'Brokerage' })).toBe('Brokerage');
  });

  it('explains stored error codes', () => {
    expect(errorLabel(null)).toBeNull();
    expect(errorLabel('ITEM_LOGIN_REQUIRED')).toContain('Relink');
    expect(errorLabel('RATE_LIMIT')).toBe('Last sync failed (RATE_LIMIT).');
  });
});

describe('sync log lines', () => {
  it('summarises a clean run', () => {
    const lines = itemLines({
      items: [
        {
          institution: 'Chase',
          live: true,
          added: 12,
          modified: 3,
          removed: 1,
          deleted: 1,
          skippedAsDuplicate: 2,
          matchedToExisting: 2,
          holdings: 0,
          historyDays: 400,
          heldForMatching: [],
          skippedBalances: [],
          findings: [],
        },
      ],
    });
    expect(lines).toEqual([
      {
        institution: 'Chase',
        text: '12 new, 3 updated, 1 removed, 1 deleted, 2 duplicates skipped, 2 accounts matched to existing, history +400 days.',
        tone: 'ok',
      },
    ]);
  });

  it('flags warnings: held accounts, skipped balances, drift, disappeared accounts', () => {
    const [line] = itemLines({
      items: [
        {
          institution: 'Bank',
          live: true,
          added: 0,
          modified: 0,
          removed: 0,
          heldForMatching: ['a'],
          skippedBalances: [{ accountId: 'b', reason: 'unsupported_currency' }],
          unmappedRows: 3,
          findings: [{ type: 'balance_drift' }, { type: 'account_disappeared' }],
        },
      ],
    });
    expect(line.tone).toBe('warn');
    expect(line.text).toContain('1 account held back');
    expect(line.text).toContain('1 balance not written');
    expect(line.text).toContain('3 transactions skipped for unmatched accounts');
    expect(line.text).toContain('does not match its transactions');
    expect(line.text).toContain('no longer reported');
  });

  it('shows errors in plain language and marks shadow mode', () => {
    expect(itemLines({ items: [{ institution: 'Chase', error: 'ITEM_LOGIN_REQUIRED' }] })[0]).toMatchObject({
      tone: 'error',
      text: expect.stringContaining('Relink'),
    });
    expect(itemLines({ items: [{ institution: 'X', live: false, added: 1 }] })[0].text).toContain('shadow mode');
  });

  it('tolerates missing, empty or malformed reports', () => {
    expect(itemLines(null)).toEqual([]);
    expect(itemLines({})).toEqual([]);
    expect(itemLines({ items: [null, {}] })).toHaveLength(2);
  });

  it('labels runs and abort reasons', () => {
    expect(runStatusLabel('aborted')).toBe('Stopped early');
    expect(abortLabel('plaid_call_cap')).toContain('Plaid calls');
    expect(abortLabel(null)).toBeNull();
    expect(
      runHeadline({
        id: '1', startedAt: 0, finishedAt: 1, trigger: 'cron', status: 'ok', abortReason: null,
        plaidCalls: 14, mutations: 40, itemsSynced: 1, report: null,
      }),
    ).toBe('Daily · 1 bank · 14 Plaid calls · 40 writes');
  });
});
