import { describe, expect, it } from 'vitest';
import {
  PENDING_MATCH_DAYS,
  isLinkedPending,
  normalizePayee,
  pendingWindow,
  pickPendingMatch,
  sameCents,
  samePayee,
  type TxnLike,
} from '../convex/finance/pending';

const posted: TxnLike = {
  sourceId: 'txn_posted',
  accountId: 'acc_1',
  date: '2026-03-10',
  amount: 42.5,
  name: 'STARBUCKS #1234',
  merchant: 'Starbucks',
  pending: false,
};

function pending(overrides: Partial<TxnLike>): TxnLike {
  return { ...posted, sourceId: 'txn_pending', pending: true, ...overrides };
}

describe('payee normalization', () => {
  it('lowercases, strips accents and punctuation, collapses whitespace', () => {
    expect(normalizePayee('  Café  Rouge, Inc. ')).toBe('cafe rouge inc');
    expect(normalizePayee('AMZN*Mktp')).toBe('amzn mktp');
    expect(normalizePayee(undefined)).toBe('');
  });

  it('compares merchants when both exist, else names', () => {
    expect(samePayee({ name: 'A', merchant: 'Starbucks' }, { name: 'B', merchant: 'STARBUCKS' })).toBe(true);
    expect(samePayee({ name: 'Same', merchant: 'Starbucks' }, { name: 'Same', merchant: 'Peets' })).toBe(false);
    expect(samePayee({ name: 'Uber  Trip' }, { name: 'uber trip', merchant: 'Uber' })).toBe(true);
    expect(samePayee({ name: '***' }, { name: '---' })).toBe(false);
  });

  it('compares amounts to the cent', () => {
    expect(sameCents(10.1, 10.100000001)).toBe(true);
    expect(sameCents(10.1, 10.11)).toBe(false);
  });
});

describe('pickPendingMatch', () => {
  it('matches same account, amount, payee within the window', () => {
    const row = pending({ date: '2026-03-08' });
    expect(pickPendingMatch(posted, [row])).toBe(row);
  });

  it(`rejects rows more than ${PENDING_MATCH_DAYS} days away`, () => {
    expect(pickPendingMatch(posted, [pending({ date: '2026-03-05' })])).not.toBeNull();
    expect(pickPendingMatch(posted, [pending({ date: '2026-03-04' })])).toBeNull();
    expect(pickPendingMatch(posted, [pending({ date: '2026-03-16' })])).toBeNull();
  });

  it('rejects other accounts, amounts, payees, posted rows, and itself', () => {
    expect(pickPendingMatch(posted, [pending({ accountId: 'acc_2' })])).toBeNull();
    expect(pickPendingMatch(posted, [pending({ amount: 42.51 })])).toBeNull();
    expect(pickPendingMatch(posted, [pending({ merchant: 'Peets' })])).toBeNull();
    expect(pickPendingMatch(posted, [pending({ pending: false })])).toBeNull();
    expect(pickPendingMatch(posted, [pending({ sourceId: posted.sourceId })])).toBeNull();
  });

  it('skips excluded (claimed or in-batch) pending rows', () => {
    const row = pending({ sourceId: 'p1' });
    expect(pickPendingMatch(posted, [row], new Set(['p1']))).toBeNull();
  });

  it('picks only the closest, preferring on/before the posted date, then lowest id', () => {
    const far = pending({ sourceId: 'far', date: '2026-03-06' });
    const near = pending({ sourceId: 'near', date: '2026-03-09' });
    expect(pickPendingMatch(posted, [far, near])).toBe(near);

    const before = pending({ sourceId: 'z_before', date: '2026-03-08' });
    const after = pending({ sourceId: 'a_after', date: '2026-03-12' });
    expect(pickPendingMatch(posted, [after, before])).toBe(before);

    const b = pending({ sourceId: 'b', date: '2026-03-09' });
    const a = pending({ sourceId: 'a', date: '2026-03-09' });
    expect(pickPendingMatch(posted, [b, a])).toBe(a);
  });

  it('builds a ±5 day index window', () => {
    expect(pendingWindow('2026-03-02')).toEqual({ from: '2026-02-25', to: '2026-03-07' });
  });
});

describe('isLinkedPending', () => {
  it('requires a pending row on the same account', () => {
    expect(isLinkedPending(posted, pending({}))).toBe(true);
    expect(isLinkedPending(posted, pending({ accountId: 'acc_2' }))).toBe(false);
    expect(isLinkedPending(posted, pending({ pending: false }))).toBe(false);
    expect(isLinkedPending(posted, null)).toBe(false);
  });

  it('ignores amount and payee for explicit links', () => {
    expect(isLinkedPending(posted, pending({ amount: 50, merchant: 'Tip adjusted' }))).toBe(true);
  });
});
