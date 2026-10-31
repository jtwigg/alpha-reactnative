import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from '../convex/plaid/crypto';
import {
  SYNC_CAPS,
  accountClass,
  budgetExceeded,
  contentKey,
  dropAlreadyStored,
  mapAccount,
  mapHolding,
  mapTransaction,
  newBudget,
  noProgress,
  runDue,
} from '../convex/plaid/model';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

describe('plaid token crypto', () => {
  it('round-trips and never stores plaintext', async () => {
    const stored = await encryptToken('access-production-abc', KEY);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('access-production-abc');
    expect(await decryptToken(stored, KEY)).toBe('access-production-abc');
  });

  it('uses a fresh iv each time', async () => {
    expect(await encryptToken('x', KEY)).not.toBe(await encryptToken('x', KEY));
  });

  it('rejects a wrong key, bad key length and missing key', async () => {
    const stored = await encryptToken('secret', KEY);
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    await expect(decryptToken(stored, other)).rejects.toThrow();
    await expect(encryptToken('x', btoa('short'))).rejects.toThrow('32 bytes');
    await expect(encryptToken('x', undefined)).rejects.toThrow('not set');
  });
});

describe('plaid mapping', () => {
  it('maps account types to finance classes', () => {
    expect(accountClass('depository')).toBe('cash');
    expect(accountClass('investment')).toBe('investments');
    expect(accountClass('credit')).toBe('liability');
    expect(accountClass('loan')).toBe('liability');
    expect(accountClass('other')).toBe('other');
  });

  it('maps an account with defaults', () => {
    const row = mapAccount(
      { account_id: 'a1', name: 'Checking', type: 'depository', balances: { current: 12.5 } },
      { sourceId: 'plaid:a1', connectionId: 'item1', now: 1 },
    );
    expect(row).toMatchObject({ class: 'cash', currentBalance: 12.5, currency: 'USD', provider: 'plaid' });
    expect(row).not.toHaveProperty('availableBalance');
  });

  it('keeps Plaid sign convention and links pending ids', () => {
    const row = mapTransaction(
      {
        transaction_id: 't2',
        pending_transaction_id: 't1',
        account_id: 'a1',
        amount: 42.5,
        date: '2026-10-01',
        pending: false,
        name: 'COFFEE #12',
        merchant_name: 'Coffee',
      },
      { accountSourceId: 'plaid:a1', accountType: 'depository' },
    );
    expect(row).toMatchObject({
      sourceId: 'plaid:t2',
      direction: 'debit',
      pendingTransactionId: 'plaid:t1',
      kind: 'cash',
    });
    expect(
      mapTransaction(
        { transaction_id: 't3', account_id: 'a1', amount: -10, date: '2026-10-01', pending: false, name: 'Refund' },
        { accountSourceId: 'plaid:a1', accountType: 'credit' },
      ),
    ).toMatchObject({ direction: 'credit', kind: 'liability' });
  });

  it('falls back to cash and security name for holdings symbols', () => {
    const securities = new Map([
      ['s1', { security_id: 's1', ticker_symbol: 'VTI' }],
      ['s2', { security_id: 's2', is_cash_equivalent: true }],
    ]);
    const base = { account_id: 'a', quantity: 2, institution_value: 100 };
    const args = { accountSourceId: 'plaid:a', securities, asOf: '2026-10-31' };
    expect(mapHolding({ ...base, security_id: 's1' }, args).symbol).toBe('VTI');
    expect(mapHolding({ ...base, security_id: 's2' }, args).symbol).toBe('CASH');
    expect(mapHolding({ ...base, security_id: 'zz' }, args).symbol).toBe('zz');
  });
});

describe('content dedupe', () => {
  const row = (sourceId: string, over = {}) => ({
    sourceId,
    accountId: 'acct',
    date: '2026-10-01',
    amount: 4.5,
    name: 'Coffee Shop',
    ...over,
  });

  it('normalises payee, date and cents', () => {
    expect(contentKey(row('a'))).toBe(contentKey(row('b', { name: 'COFFEE  SHOP!' })));
    expect(contentKey(row('a'))).not.toBe(contentKey(row('b', { amount: 4.51 })));
  });

  it('skips rows already stored under another id (relink)', () => {
    const existing = new Map([[contentKey(row('old')), 1]]);
    const { keep, skipped } = dropAlreadyStored([row('new')], existing, new Set());
    expect(keep).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('keeps two genuine identical purchases when only one is stored', () => {
    const existing = new Map([[contentKey(row('old1')), 1]]);
    const { keep } = dropAlreadyStored([row('n1'), row('n2')], existing, new Set());
    expect(keep.map((r) => r.sourceId)).toEqual(['n2']);
  });

  it('keeps both identical purchases when nothing is stored', () => {
    const { keep } = dropAlreadyStored([row('n1'), row('n2')], new Map(), new Set());
    expect(keep).toHaveLength(2);
  });

  it('never drops a row whose id is already known (normal update)', () => {
    const existing = new Map([[contentKey(row('same')), 1]]);
    const { keep } = dropAlreadyStored([row('same')], existing, new Set(['same']));
    expect(keep).toHaveLength(1);
  });
});

describe('run safeguards', () => {
  it('trips each cap', () => {
    const b = newBudget();
    expect(budgetExceeded(b)).toBeNull();
    b.plaidCalls = SYNC_CAPS.maxPlaidCalls;
    expect(budgetExceeded(b)).toBe('plaid_call_cap');
    b.plaidCalls = 0;
    b.mutations = SYNC_CAPS.maxMutations;
    expect(budgetExceeded(b)).toBe('mutation_cap');
  });

  it('enforces the 20h minimum between runs', () => {
    const now = 1_000_000_000;
    expect(runDue(null, now)).toBe(true);
    expect(runDue(now - 19 * 3_600_000, now)).toBe(false);
    expect(runDue(now - 21 * 3_600_000, now)).toBe(true);
  });

  it('stops on empty pages or an unchanged cursor', () => {
    expect(noProgress({ added: 0, modified: 0, removed: 0, prevCursor: 'a', nextCursor: 'b' })).toBe(true);
    expect(noProgress({ added: 3, modified: 0, removed: 0, prevCursor: 'a', nextCursor: 'a' })).toBe(true);
    expect(noProgress({ added: 3, modified: 0, removed: 0, prevCursor: 'a', nextCursor: 'b' })).toBe(false);
  });
});
