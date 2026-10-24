import { describe, expect, it } from 'vitest';
import {
  addDeleteCounts,
  emptyDeleteCounts,
  affectedBuckets,
  normalizeDeleteIds,
  normalizeDeleteTransactionIds,
} from '../convex/finance/delete';
import {
  DELETE_ACCOUNT_IDS_MAX,
  DELETE_TRANSACTION_IDS_MAX,
} from '../convex/finance/validators';

describe('delete_transactions ids', () => {
  it('dedupes and trims, and caps at 500', () => {
    expect(normalizeDeleteTransactionIds([' t1', 't1 ', 'k57abc'])).toEqual(['t1', 'k57abc']);
    expect(() => normalizeDeleteTransactionIds([' '])).toThrow(/delete_transactions: ids is empty/);
    expect(() =>
      normalizeDeleteTransactionIds(
        Array.from({ length: DELETE_TRANSACTION_IDS_MAX + 1 }, (_, i) => `t${i}`),
      ),
    ).toThrow(/max 500/);
  });

  it('lists each touched (account, month) bucket once, sorted', () => {
    expect(
      affectedBuckets([
        { accountId: 'b', date: '2026-02-03' },
        { accountId: 'a', date: '2026-03-31' },
        { accountId: 'a', date: '2026-03-01' },
        { accountId: 'a', date: '2026-01-15' },
      ]),
    ).toEqual([
      { accountId: 'a', month: '2026-01' },
      { accountId: 'a', month: '2026-03' },
      { accountId: 'b', month: '2026-02' },
    ]);
    expect(affectedBuckets([])).toEqual([]);
  });
});

describe('delete_accounts ids', () => {
  it('dedupes and trims, and caps at 50', () => {
    expect(normalizeDeleteIds([' acc_1 ', 'acc_1', 'acc_2'])).toEqual([
      'acc_1',
      'acc_2',
    ]);
    expect(() => normalizeDeleteIds([])).toThrow(/empty/);
    expect(() => normalizeDeleteIds(['', '  '])).toThrow(/empty/);
    expect(() =>
      normalizeDeleteIds(Array.from({ length: DELETE_ACCOUNT_IDS_MAX + 1 }, (_, i) => `a${i}`)),
    ).toThrow(/max 50/);
    expect(
      normalizeDeleteIds(Array.from({ length: DELETE_ACCOUNT_IDS_MAX }, (_, i) => `a${i}`)),
    ).toHaveLength(50);
  });

  it('accumulates per-table counts across scheduled continuations', () => {
    const first = addDeleteCounts(emptyDeleteCounts(), {
      accounts: 0,
      snapshots: 200,
      transactions: 50,
      holdings: 10,
    });
    const total = addDeleteCounts(first, {
      accounts: 1,
      snapshots: 3,
      transactions: 0,
      holdings: 0,
    });
    expect(total).toEqual({
      accounts: 1,
      snapshots: 203,
      transactions: 50,
      holdings: 10,
    });
  });
});
