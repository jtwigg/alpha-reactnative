import { describe, expect, it } from 'vitest';
import {
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
  ...over,
});

describe('plaid home banner', () => {
  it('is hidden when nothing needs attention', () => {
    expect(plaidBannerLabel(undefined)).toBeNull();
    expect(plaidBannerLabel({ items: [item()], openDeletionProposals: 0 })).toBeNull();
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
