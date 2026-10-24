import { describe, expect, it, vi } from 'vitest';
import { canonicalizeFinanceRow, financeContentHash, bucketHash } from '../convex/finance/hash';
import { dispatchFinanceOp } from '../convex/finance/gateway';
import {
  accountScope,
  assertReturnScope,
  dedupeReturnsByKey,
  groupByAsOf,
  parseAccountScope,
} from '../convex/finance/twrModel';

const FLOW = {
  flowId: 'flow_wf_1',
  accountId: 'acc_wealthfront',
  date: '2026-08-15',
  amount: 2500,
  kind: 'external',
  counterpartAccountId: 'acc_checking',
  counterpartFlowId: null,
  counterpartTxnId: 'txn_1',
  evidence: null,
  externalToInvestable: true,
};

const FLOW_CANONICAL = [
  'finance.v1',
  'flows',
  'flowId=flow_wf_1',
  'accountId=acc_wealthfront',
  'date=2026-08-15',
  'amount=2500.00000000',
  'kind=external',
  'counterpartAccountId=acc_checking',
  'counterpartFlowId=null',
  'counterpartTxnId=txn_1',
  'evidence=null',
  'externalToInvestable=true',
].join('\n');

const RETURN = {
  scope: 'reliable_subset',
  window: '1Y',
  asOf: '2026-10-23',
  startDate: '2025-10-23',
  cumulative: 0.0825,
  annualized: 0.0825,
  reliable: true,
  startOnAnchor: true,
  flowsFullyKnown: true,
  method: 'finance.twr.v1',
  note: null,
};

describe('TWR helpers', () => {
  it('parses account scopes', () => {
    expect(accountScope('acc_1')).toBe('account:acc_1');
    expect(parseAccountScope('account:acc_1')).toBe('acc_1');
    expect(() => assertReturnScope('portfolio')).toThrow(/account:<id>/);
    assertReturnScope('total');
    assertReturnScope('reliable_subset');
    assertReturnScope('account:acc_1');
  });

  it('replaces a batch by asOf and last-wins on scope+window', () => {
    const grouped = groupByAsOf([
      { scope: 'total', window: '1Y', asOf: '2026-10-23', cumulative: 1 },
      { scope: 'total', window: '1Y', asOf: '2026-10-23', cumulative: 2 },
      { scope: 'total', window: '1Y', asOf: '2026-10-22', cumulative: 3 },
    ]);
    expect([...grouped.keys()]).toEqual(['2026-10-23', '2026-10-22']);
    const kept = dedupeReturnsByKey(grouped.get('2026-10-23')!);
    expect(kept).toHaveLength(1);
    expect(kept[0].cumulative).toBe(2);
  });
});

describe('finance.v1 hashes for flows and returns', () => {
  it('canonicalizes a flow row', () => {
    expect(canonicalizeFinanceRow('flows', FLOW)).toBe(FLOW_CANONICAL);
  });

  it('hashes returns with null annualized as the null token', () => {
    const canonical = canonicalizeFinanceRow('returns', { ...RETURN, annualized: null });
    expect(canonical).toContain('annualized=null');
    expect(canonical).toContain('method=finance.twr.v1');
    expect(canonical).toContain('reliable=true');
  });

  it('checksums sorted content hashes the same way as bucketHash', async () => {
    const a = await financeContentHash('flows', FLOW);
    const b = await financeContentHash('returns', RETURN);
    expect(await bucketHash([b, a])).toBe(await bucketHash([a, b]));
  });
});

describe('gateway TWR ops', () => {
  it('routes upsert_flows, delete_flows, and upsert_returns', async () => {
    const runMutation = vi.fn(async () => ({ inserted: 1 }));
    const runQuery = vi.fn();
    await dispatchFinanceOp({ runMutation, runQuery }, 'upsert_flows', { items: [FLOW] });
    await dispatchFinanceOp({ runMutation, runQuery }, 'delete_flows', { ids: ['flow_wf_1'] });
    await dispatchFinanceOp({ runMutation, runQuery }, 'upsert_returns', { items: [RETURN] });
    expect(runMutation).toHaveBeenCalledTimes(3);
    expect(runQuery).not.toHaveBeenCalled();
  });
});
