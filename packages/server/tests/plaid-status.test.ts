import { describe, expect, it } from 'vitest';
import {
  accountLabel,
  errorLabel,
  lastSyncedLabel,
  plaidBannerLabel,
  plaidStatusLabel,
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
