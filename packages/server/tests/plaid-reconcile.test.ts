import { describe, expect, it } from 'vitest';
import { buildNetWorthModel, type SeriesSnapshot } from '../convex/finance/series';
import type { PlaidAccount, PlaidTransaction } from '../convex/plaid/model';
import {
  checkAccountBalance,
  checkBalanceDrift,
  diffAccounts,
  planTransactionPage,
  reconstructBalances,
  roundCents,
  stalePendingIds,
  type StoredTxn,
} from '../convex/plaid/reconcile';

// ── fixtures ────────────────────────────────────────────────────────────────

const acct = (over: Partial<PlaidAccount> & { balances?: PlaidAccount['balances'] } = {}): PlaidAccount => ({
  account_id: 'a1',
  name: 'Checking',
  type: 'depository',
  balances: { current: 100, iso_currency_code: 'USD' },
  ...over,
});

const txn = (id: string, over: Partial<PlaidTransaction> = {}): PlaidTransaction => ({
  transaction_id: id,
  account_id: 'a1',
  amount: 10,
  date: '2026-10-01',
  pending: false,
  name: 'Coffee Shop',
  ...over,
});

const maps = {
  accountSourceIds: new Map([['a1', 'plaid:a1']]),
  accountTypes: new Map([['a1', 'depository']]),
};

const page = (over: Partial<Parameters<typeof planTransactionPage>[0]> = {}) =>
  planTransactionPage({ added: [], modified: [], removed: [], stored: [], ...maps, ...over });

/**
 * In-memory ledger that applies page plans the way the real write path does:
 * upserts by sourceId, a posted row with `pendingTransactionId` replaces the
 * stored pending row, and deletes remove rows. Lets tests assert end state.
 */
class Ledger {
  rows = new Map<string, StoredTxn & { pending: boolean }>();

  apply(plan: ReturnType<typeof planTransactionPage>) {
    for (const row of plan.upserts) {
      if (row.pendingTransactionId) this.rows.delete(row.pendingTransactionId);
      this.rows.set(row.sourceId, {
        sourceId: row.sourceId,
        accountId: row.accountId,
        date: row.date,
        amount: row.amount,
        name: row.name,
        ...(row.merchant ? { merchant: row.merchant } : {}),
        pending: row.pending,
      });
    }
    for (const id of plan.deletes) this.rows.delete(id);
  }

  stored(): StoredTxn[] {
    return [...this.rows.values()];
  }

  sync(over: Partial<Parameters<typeof planTransactionPage>[0]>) {
    const plan = page({ ...over, stored: this.stored() });
    this.apply(plan);
    return plan;
  }
}

// ── balances ────────────────────────────────────────────────────────────────

describe('balance validation', () => {
  it('accepts a normal USD balance and rounds to cents', () => {
    expect(checkAccountBalance(acct({ balances: { current: 12.3456, iso_currency_code: 'USD' } }))).toEqual({
      ok: true,
      balance: 12.35,
    });
  });

  it('treats an exact zero balance as valid, not missing', () => {
    expect(checkAccountBalance(acct({ balances: { current: 0, iso_currency_code: 'USD' } }))).toEqual({
      ok: true,
      balance: 0,
    });
  });

  it('never turns a missing balance into zero', () => {
    expect(checkAccountBalance(acct({ balances: { current: null } }))).toEqual({
      ok: false,
      reason: 'balance_unavailable',
    });
    expect(checkAccountBalance(acct({ balances: {} }))).toMatchObject({ ok: false });
  });

  it('rejects NaN and Infinity', () => {
    expect(checkAccountBalance(acct({ balances: { current: Number.NaN } }))).toEqual({
      ok: false,
      reason: 'balance_not_finite',
    });
    expect(checkAccountBalance(acct({ balances: { current: Number.POSITIVE_INFINITY } }))).toMatchObject({
      ok: false,
    });
  });

  it('refuses foreign and unofficial currencies instead of summing them as dollars', () => {
    expect(checkAccountBalance(acct({ balances: { current: 50, iso_currency_code: 'EUR' } }))).toEqual({
      ok: false,
      reason: 'unsupported_currency',
    });
    expect(
      checkAccountBalance(acct({ balances: { current: 1, iso_currency_code: null, unofficial_currency_code: 'BTC' } })),
    ).toMatchObject({ ok: false, reason: 'unsupported_currency' });
  });

  it('accepts lowercase usd and a missing currency code (assumed USD)', () => {
    expect(checkAccountBalance(acct({ balances: { current: 5, iso_currency_code: 'usd' } })).ok).toBe(true);
    expect(checkAccountBalance(acct({ balances: { current: 5 } })).ok).toBe(true);
  });

  it('keeps negative cash balances (overdraft)', () => {
    expect(checkAccountBalance(acct({ balances: { current: -42.5, iso_currency_code: 'USD' } }))).toEqual({
      ok: true,
      balance: -42.5,
    });
  });
});

describe('float safety', () => {
  it('rounds the classic 0.1 + 0.2 and half-cent cases to cents', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(-1.005)).toBe(-1);
  });
});

// ── balance drift ───────────────────────────────────────────────────────────

describe('balance drift check', () => {
  const base = { previous: { asOf: '2026-10-01', balance: 1000 } };

  it('is ok when spending matches the balance drop (cash)', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-03', balance: 900 },
      transactions: [
        { date: '2026-10-02', amount: 60, pending: false },
        { date: '2026-10-03', amount: 40, pending: false },
      ],
    });
    expect(r).toMatchObject({ status: 'ok', expectedDelta: -100, actualDelta: -100, diff: 0 });
  });

  it('counts deposits (negative amounts) as inflow', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-02', balance: 1500 },
      transactions: [{ date: '2026-10-02', amount: -500, pending: false }],
    });
    expect(r.status).toBe('ok');
  });

  it('flags drift when a transaction is missing', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-03', balance: 850 },
      transactions: [{ date: '2026-10-02', amount: 100, pending: false }],
    });
    expect(r).toMatchObject({ status: 'drift', diff: -50 });
  });

  it('ignores pending transactions', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-02', balance: 1000 },
      transactions: [{ date: '2026-10-02', amount: 75, pending: true }],
    });
    expect(r.status).toBe('ok');
  });

  it('excludes the baseline day and includes the current day', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-02', balance: 970 },
      transactions: [
        { date: '2026-10-01', amount: 999, pending: false },
        { date: '2026-10-02', amount: 30, pending: false },
        { date: '2026-10-03', amount: 999, pending: false },
      ],
    });
    expect(r.status).toBe('ok');
  });

  it('treats a card purchase as owing more and a payment as owing less', () => {
    const purchase = checkBalanceDrift({
      accountClass: 'liability',
      previous: { asOf: '2026-10-01', balance: 300 },
      current: { asOf: '2026-10-02', balance: 350 },
      transactions: [{ date: '2026-10-02', amount: 50, pending: false }],
    });
    expect(purchase).toMatchObject({ status: 'ok', expectedDelta: 50 });
    const payment = checkBalanceDrift({
      accountClass: 'liability',
      previous: { asOf: '2026-10-01', balance: 300 },
      current: { asOf: '2026-10-02', balance: 100 },
      transactions: [{ date: '2026-10-02', amount: -200, pending: false }],
    });
    expect(payment.status).toBe('ok');
  });

  it('skips investments, missing baselines and zero elapsed time', () => {
    const t = [{ date: '2026-10-02', amount: 5, pending: false }];
    const cur = { asOf: '2026-10-02', balance: 1 };
    expect(checkBalanceDrift({ accountClass: 'investments', ...base, current: cur, transactions: t })).toEqual({
      status: 'skipped',
      reason: 'investment',
    });
    expect(checkBalanceDrift({ accountClass: 'cash', previous: null, current: cur, transactions: t })).toEqual({
      status: 'skipped',
      reason: 'no_baseline',
    });
    expect(
      checkBalanceDrift({ accountClass: 'cash', previous: cur, current: cur, transactions: t }),
    ).toEqual({ status: 'skipped', reason: 'no_elapsed_time' });
  });

  it('tolerates float noise within a cent', () => {
    const r = checkBalanceDrift({
      accountClass: 'cash',
      ...base,
      current: { asOf: '2026-10-02', balance: 1000 - (0.1 + 0.2) },
      transactions: [{ date: '2026-10-02', amount: 0.3, pending: false }],
    });
    expect(r.status).toBe('ok');
  });
});

// ── history reconstruction ─────────────────────────────────────────────────

describe('balance history reconstruction', () => {
  const asOf = '2026-10-05';

  it('walks cash backwards: money out raises the earlier balance', () => {
    const series = reconstructBalances({
      accountClass: 'cash',
      balance: 900,
      asOf,
      from: '2026-10-03',
      transactions: [
        { date: '2026-10-05', amount: 100, pending: false },
        { date: '2026-10-04', amount: -50, pending: false },
      ],
    });
    // Oct 5: spent 100 (900 after, 1000 before). Oct 4: deposit of 50 (1000 after, 950 before).
    expect(series).toEqual([
      { asOf: '2026-10-03', balance: 950 },
      { asOf: '2026-10-04', balance: 1000 },
      { asOf: '2026-10-05', balance: 900 },
    ]);
  });

  it('is flat when there are no transactions', () => {
    const series = reconstructBalances({ accountClass: 'cash', balance: 10, asOf, from: '2026-10-03', transactions: [] });
    expect(series.map((p) => p.balance)).toEqual([10, 10, 10]);
  });

  it('walks a credit card backwards: a purchase means less was owed before', () => {
    const series = reconstructBalances({
      accountClass: 'liability',
      balance: 350,
      asOf: '2026-10-02',
      from: '2026-10-01',
      transactions: [{ date: '2026-10-02', amount: 50, pending: false }],
    });
    expect(series).toEqual([
      { asOf: '2026-10-01', balance: 300 },
      { asOf: '2026-10-02', balance: 350 },
    ]);
  });

  it('refuses to invent investment history', () => {
    expect(
      reconstructBalances({ accountClass: 'investments', balance: 5000, asOf, from: '2026-10-01', transactions: [] }),
    ).toEqual([]);
  });

  it('ignores pending, future-dated and pre-window transactions', () => {
    const series = reconstructBalances({
      accountClass: 'cash',
      balance: 500,
      asOf,
      from: '2026-10-04',
      transactions: [
        { date: '2026-10-05', amount: 999, pending: true },
        { date: '2026-10-06', amount: 999, pending: false },
        { date: '2026-10-01', amount: 999, pending: false },
      ],
    });
    expect(series.map((p) => p.balance)).toEqual([500, 500]);
  });

  it('returns nothing when the window is inverted, and one point for a single day', () => {
    expect(reconstructBalances({ accountClass: 'cash', balance: 1, asOf, from: '2026-10-06', transactions: [] })).toEqual([]);
    expect(reconstructBalances({ accountClass: 'cash', balance: 1, asOf, from: asOf, transactions: [] })).toHaveLength(1);
  });

  it('replaying the transactions forward lands exactly on the known balance', () => {
    const transactions = [
      { date: '2026-10-02', amount: 12.34, pending: false },
      { date: '2026-10-02', amount: 0.66, pending: false },
      { date: '2026-10-04', amount: -250, pending: false },
      { date: '2026-10-05', amount: 19.99, pending: false },
    ];
    const series = reconstructBalances({ accountClass: 'cash', balance: 1234.56, asOf, from: '2026-10-01', transactions });
    expect(series).toHaveLength(5);
    let balance = series[0].balance;
    for (const point of series.slice(1)) {
      const day = transactions.filter((t) => t.date === point.asOf).reduce((s, t) => s + t.amount, 0);
      balance = roundCents(balance - day);
      expect(point.balance).toBe(balance);
    }
    expect(series[series.length - 1].balance).toBe(1234.56);
  });
});

// ── page planning ──────────────────────────────────────────────────────────

describe('transaction page planning', () => {
  it('upserts added and modified rows with the Plaid sign convention', () => {
    const plan = page({
      added: [txn('t1', { amount: 25 }), txn('t2', { amount: -40, name: 'Payroll' })],
      modified: [txn('t3', { amount: 0 })],
    });
    expect(plan.upserts.map((r) => [r.sourceId, r.direction])).toEqual([
      ['plaid:t1', 'debit'],
      ['plaid:t2', 'credit'],
      ['plaid:t3', 'credit'],
    ]);
  });

  it('is idempotent: replaying the same page changes nothing', () => {
    const ledger = new Ledger();
    const args = { added: [txn('t1'), txn('t2', { amount: 5 })] };
    ledger.sync(args);
    const first = [...ledger.rows.keys()].sort();
    const replay = ledger.sync(args);
    expect([...ledger.rows.keys()].sort()).toEqual(first);
    expect(replay.skippedAsDuplicate).toBe(0);
    expect(ledger.rows.size).toBe(2);
  });

  it('last occurrence wins when an id appears in added and modified', () => {
    const plan = page({ added: [txn('t1', { amount: 10 })], modified: [txn('t1', { amount: 12 })] });
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].amount).toBe(12);
  });

  it('applies a modification to the stored row', () => {
    const ledger = new Ledger();
    ledger.sync({ added: [txn('t1', { amount: 10, date: '2026-10-01' })] });
    ledger.sync({ modified: [txn('t1', { amount: 12.5, date: '2026-10-02' })] });
    expect(ledger.rows.get('plaid:t1')).toMatchObject({ amount: 12.5, date: '2026-10-02' });
    expect(ledger.rows.size).toBe(1);
  });

  describe('pending to posted', () => {
    it('replaces the pending row with the posted row (amount changed by a tip)', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('p1', { pending: true, amount: 20 })] });
      const plan = ledger.sync({
        added: [txn('s1', { pending_transaction_id: 'p1', amount: 24, date: '2026-10-02' })],
        removed: [{ transaction_id: 'p1' }],
      });
      expect(plan.replacedPendings).toBe(1);
      expect(plan.deletes).toEqual([]);
      expect([...ledger.rows.keys()]).toEqual(['plaid:s1']);
      expect(ledger.rows.get('plaid:s1')).toMatchObject({ amount: 24, pending: false });
    });

    it('works when the posted row and the pending removal arrive in different pages', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('p1', { pending: true })] });
      ledger.sync({ added: [txn('s1', { pending_transaction_id: 'p1' })] });
      const later = ledger.sync({ removed: [{ transaction_id: 'p1' }] });
      expect([...ledger.rows.keys()]).toEqual(['plaid:s1']);
      expect(later.ignoredRemovals).toBe(1);
    });

    it('deletes a pending that disappears without ever posting (voided authorisation)', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('p1', { pending: true, amount: 80 })] });
      const plan = ledger.sync({ removed: [{ transaction_id: 'p1' }] });
      expect(plan.deletes).toEqual(['plaid:p1']);
      expect(ledger.rows.size).toBe(0);
    });

    it('never double counts: pending + posted for the same purchase leaves one row', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('p1', { pending: true, amount: 30 })] });
      ledger.sync({
        added: [txn('s1', { pending_transaction_id: 'p1', amount: 30 })],
        removed: [{ transaction_id: 'p1' }],
      });
      const total = [...ledger.rows.values()].reduce((s, r) => s + r.amount, 0);
      expect(total).toBe(30);
    });

    it('a posted row with a pending link is never dropped as a content duplicate', () => {
      const stored: StoredTxn[] = [
        { sourceId: 'plaid:p1', accountId: 'plaid:a1', date: '2026-10-01', amount: 30, name: 'Coffee Shop' },
      ];
      const plan = page({ stored, added: [txn('s1', { pending_transaction_id: 'p1', amount: 30 })] });
      expect(plan.upserts.map((r) => r.sourceId)).toEqual(['plaid:s1']);
      expect(plan.skippedAsDuplicate).toBe(0);
    });
  });

  describe('removed', () => {
    it('ignores removals for rows Alpha never held', () => {
      const plan = page({ removed: [{ transaction_id: 'ghost' }] });
      expect(plan).toMatchObject({ deletes: [], ignoredRemovals: 1 });
    });

    it('keeps a row that is removed and re-added in the same page', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('t1')] });
      const plan = ledger.sync({ added: [txn('t1', { amount: 11 })], removed: [{ transaction_id: 't1' }] });
      expect(plan.deletes).toEqual([]);
      expect(ledger.rows.get('plaid:t1')?.amount).toBe(11);
    });

    it('never deletes rows another source wrote (non-plaid ids)', () => {
      const stored: StoredTxn[] = [
        { sourceId: 'finance:legacy1', accountId: 'acct', date: '2026-10-01', amount: 10, name: 'x' },
      ];
      const plan = page({ stored, removed: [{ transaction_id: 'legacy1' }] });
      expect(plan.deletes).toEqual([]);
    });

    it('de-duplicates repeated removals', () => {
      const ledger = new Ledger();
      ledger.sync({ added: [txn('t1')] });
      const plan = ledger.sync({ removed: [{ transaction_id: 't1' }, { transaction_id: 't1' }] });
      expect(plan.deletes).toEqual(['plaid:t1']);
    });
  });

  describe('relink and duplicates', () => {
    const legacyCoffee = (id: string): StoredTxn => ({
      sourceId: id,
      accountId: 'plaid:a1',
      date: '2026-10-01',
      amount: 10,
      name: 'Coffee Shop',
    });

    it('skips rows already held under another id after a relink', () => {
      const plan = page({ stored: [legacyCoffee('old-1')], added: [txn('new-1')] });
      expect(plan.upserts).toHaveLength(0);
      expect(plan.skippedAsDuplicate).toBe(1);
    });

    it('keeps the extra purchase when Plaid has two identical rows and one is stored', () => {
      const plan = page({ stored: [legacyCoffee('old-1')], added: [txn('n1'), txn('n2')] });
      expect(plan.upserts.map((r) => r.sourceId)).toEqual(['plaid:n2']);
    });

    it('keeps both identical same-day purchases when nothing is stored', () => {
      const plan = page({ added: [txn('n1'), txn('n2')] });
      expect(plan.upserts).toHaveLength(2);
    });

    it('does not mistake different amounts, dates or payees for duplicates', () => {
      const stored = [legacyCoffee('old-1')];
      const plan = page({
        stored,
        added: [
          txn('a', { amount: 10.01 }),
          txn('b', { date: '2026-10-02' }),
          txn('c', { name: 'Different Cafe' }),
        ],
      });
      expect(plan.upserts).toHaveLength(3);
    });

    it('matches payees regardless of case and punctuation', () => {
      const plan = page({ stored: [legacyCoffee('old-1')], added: [txn('n1', { name: 'COFFEE  shop!' })] });
      expect(plan.skippedAsDuplicate).toBe(1);
    });

    it('does not dedupe across accounts', () => {
      const stored: StoredTxn[] = [{ ...legacyCoffee('old-1'), accountId: 'other-account' }];
      expect(page({ stored, added: [txn('n1')] }).upserts).toHaveLength(1);
    });
  });

  describe('account mapping', () => {
    it('holds back rows for accounts that are not mapped', () => {
      const plan = page({ added: [txn('t1'), txn('t2', { account_id: 'unmatched' })] });
      expect(plan.upserts.map((r) => r.sourceId)).toEqual(['plaid:t1']);
      expect(plan.unmappedSkipped).toBe(1);
    });

    it('writes to the matched legacy account id, not a new one', () => {
      const plan = page({
        accountSourceIds: new Map([['a1', 'finance:checking']]),
        added: [txn('t1')],
      });
      expect(plan.upserts[0].accountId).toBe('finance:checking');
    });

    it('classifies transaction kind by account type', () => {
      const plan = page({
        accountSourceIds: new Map([['a1', 'x']]),
        accountTypes: new Map([['a1', 'credit']]),
        added: [txn('t1')],
      });
      expect(plan.upserts[0].kind).toBe('liability');
    });
  });

  it('copes with empty pages, zero-dollar rows, and refunds', () => {
    expect(page()).toMatchObject({ upserts: [], deletes: [] });
    const plan = page({ added: [txn('z', { amount: 0 }), txn('r', { amount: -19.99, name: 'Refund' })] });
    expect(plan.upserts.map((r) => r.amount)).toEqual([0, -19.99]);
  });

  it('survives a multi-page feed with removals referencing earlier pages', () => {
    const ledger = new Ledger();
    ledger.sync({ added: [txn('t1', { amount: 5 }), txn('t2', { amount: 7 })] });
    ledger.sync({ added: [txn('t3', { amount: 9 })], removed: [{ transaction_id: 't1' }] });
    ledger.sync({ modified: [txn('t2', { amount: 8 })], removed: [{ transaction_id: 't3' }] });
    expect([...ledger.rows.values()].map((r) => [r.sourceId, r.amount])).toEqual([['plaid:t2', 8]]);
  });
});

// ── housekeeping checks ─────────────────────────────────────────────────────

describe('stale pendings and account changes', () => {
  it('flags only pendings older than the threshold', () => {
    const rows = [
      { sourceId: 'a', pending: true, date: '2026-10-01' },
      { sourceId: 'b', pending: true, date: '2026-10-25' },
      { sourceId: 'c', pending: false, date: '2026-09-01' },
    ];
    expect(stalePendingIds(rows, '2026-10-31')).toEqual(['a']);
    expect(stalePendingIds(rows, '2026-10-31', 3)).toEqual(['a', 'b']);
  });

  it('reports accounts that disappeared or appeared', () => {
    expect(diffAccounts(['a', 'b'], ['b', 'c'])).toEqual({ disappeared: ['a'], appeared: ['c'] });
    expect(diffAccounts(['a'], ['a'])).toEqual({ disappeared: [], appeared: [] });
  });
});

// ── net worth accuracy ─────────────────────────────────────────────────────

describe('net worth from reconciled snapshots', () => {
  const NOW = Date.parse('2026-10-31T12:00:00Z');
  const account = (sourceId: string, cls: string, balance: number) => ({
    sourceId,
    name: sourceId,
    class: cls,
    provider: 'plaid',
    currentBalance: balance,
    syncedAt: NOW,
  });
  const snap = (accountId: string, balance: number, asOf = '2026-10-31') => ({
    accountId,
    asOf,
    balance,
    source: 'observed' as const,
  });
  const nw = (accounts: ReturnType<typeof account>[], snapshots: SeriesSnapshot[]) =>
    buildNetWorthModel({ accounts, snapshots, range: '1M', asOf: '2026-10-31' });

  it('assets minus liabilities, with owed amounts subtracted', () => {
    const model = nw(
      [
        account('checking', 'cash', 1000),
        account('brokerage', 'investments', 5000),
        account('card', 'liability', 300),
        account('loan', 'liability', 20000),
      ],
      [snap('checking', 1000), snap('brokerage', 5000), snap('card', 300), snap('loan', 20000)],
    );
    expect(model.headline).toBe(-14300);
    expect(model.assets).toBe(6000);
    // The model reports liabilities as a negative contribution to net worth.
    expect(model.liabilities).toBe(-20300);
  });

  it('paying down a card raises net worth by exactly the cash that left', () => {
    const before = nw(
      [account('checking', 'cash', 1000), account('card', 'liability', 300)],
      [snap('checking', 1000), snap('card', 300)],
    );
    const after = nw(
      [account('checking', 'cash', 800), account('card', 'liability', 100)],
      [snap('checking', 800), snap('card', 100)],
    );
    // 200 left checking and 200 less is owed: net worth is unchanged.
    expect(after.headline).toBe(before.headline);
  });

  it('a purchase on a card lowers net worth by the amount', () => {
    const before = nw([account('card', 'liability', 300)], [snap('card', 300)]);
    const after = nw([account('card', 'liability', 350)], [snap('card', 350)]);
    expect(before.headline - after.headline).toBe(50);
  });

  it('a zero balance counts as zero, not as missing', () => {
    const model = nw([account('checking', 'cash', 0), account('savings', 'cash', 250)], [snap('checking', 0), snap('savings', 250)]);
    expect(model.headline).toBe(250);
  });

  it('keeps the last known balance for an account that stopped reporting', () => {
    const model = nw(
      [account('checking', 'cash', 700), account('old-savings', 'cash', 500)],
      [snap('checking', 700), snap('old-savings', 500, '2026-10-20')],
    );
    expect(model.headline).toBe(1200);
  });

  it('tracks net worth over time from reconstructed history', () => {
    const history = reconstructBalances({
      accountClass: 'cash',
      balance: 900,
      asOf: '2026-10-31',
      from: '2026-10-29',
      transactions: [{ date: '2026-10-30', amount: 100, pending: false }],
    });
    const snapshots = history.map((p) => ({ accountId: 'checking', asOf: p.asOf, balance: p.balance, source: 'reconstructed' as const }));
    const model = nw([account('checking', 'cash', 900)], snapshots);
    expect(model.headline).toBe(900);
    const totals = model.points.map((p) => [p.asOf, p.total]);
    expect(totals.slice(-3)).toEqual([
      ['2026-10-29', 1000],
      ['2026-10-30', 900],
      ['2026-10-31', 900],
    ]);
  });
});
