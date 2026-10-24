import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FINANCE_FIELD_ORDER,
  FINANCE_HASH_VERSION,
  bucketHash,
  canonicalizeFinanceRow,
  financeContentHash,
  formatInteger,
  formatMoney,
  sha256Hex,
} from '../convex/finance/hash';

const SNAPSHOT_FIELDS = {
  accountId: 'acc_chase_checking',
  accountName: 'Checking',
  class: 'cash',
  asOf: '2026-07-31',
  balance: 1250.5,
  source: 'observed',
  method: null,
};

const SNAPSHOT_CANONICAL = [
  'finance.v1',
  'balance_snapshots',
  'accountId=acc_chase_checking',
  'accountName=Checking',
  'class=cash',
  'asOf=2026-07-31',
  'balance=1250.50000000',
  'source=observed',
  'method=null',
].join('\n');

/** SHA-256 of SNAPSHOT_CANONICAL UTF-8 bytes (155 bytes, no trailing LF). */
const SNAPSHOT_GOLDEN =
  '464340342d1c6d10da6462882b7d7a0d945fd3a2062906a4fe70370643c5790c';

const ACCOUNT_FIELDS = {
  sourceId: 'acc_1',
  provider: 'plaid',
  connectionId: 'conn_plaid',
  class: 'investments',
  name: 'Brokerage',
  mask: '1234',
  type: 'brokerage',
  subtype: 'ira',
  currentBalance: 10000,
  availableBalance: undefined,
  currency: 'USD',
  syncedAt: 1790000000000,
  coverageStart: '2026-07-31',
};

const ACCOUNT_CANONICAL = [
  'finance.v1',
  'accounts',
  'sourceId=acc_1',
  'provider=plaid',
  'connectionId=conn_plaid',
  'class=investments',
  'name=Brokerage',
  'mask=1234',
  'type=brokerage',
  'subtype=ira',
  'currentBalance=10000.00000000',
  'availableBalance=null',
  'currency=USD',
  'syncedAt=1790000000000',
  'coverageStart=2026-07-31',
].join('\n');

const ACCOUNT_GOLDEN =
  '54f4a0c53ae58ffe21b7706f11fc28f20578cab01dc9dde2c6bb4099191ca06c';

describe('money / integer formatting', () => {
  it('formats money to 8 fixed decimals', () => {
    expect(formatMoney(1250.5)).toBe('1250.50000000');
    expect(formatMoney(0)).toBe('0.00000000');
    expect(formatMoney(-0)).toBe('0.00000000');
    expect(formatMoney(-10)).toBe('-10.00000000');
    expect(formatMoney(0.1)).toBe('0.10000000');
    expect(formatMoney(1.23456789)).toBe('1.23456789');
    expect(formatMoney(1.234567881)).toBe('1.23456788');
    // IEEE 1.234567885 * 1e8 is just under the half-up boundary, so
    // Math.round(abs * 1e8) stays at 123456788.
    expect(formatMoney(1.234567885)).toBe('1.23456788');
  });

  it('formats integers without leading zeros', () => {
    expect(formatInteger(0)).toBe('0');
    expect(formatInteger(-0)).toBe('0');
    expect(formatInteger(1_725_000_000_000)).toBe('1725000000000');
    expect(formatInteger(-3.9)).toBe('-3');
  });
});

describe('canonicalizeFinanceRow', () => {
  it('matches the byte-for-byte snapshot recipe', () => {
    const canonical = canonicalizeFinanceRow('balance_snapshots', SNAPSHOT_FIELDS);
    expect(canonical).toBe(SNAPSHOT_CANONICAL);
    expect(Buffer.byteLength(canonical, 'utf8')).toBe(155);
    expect(canonical.includes('\r')).toBe(false);
    expect(canonical.endsWith('\n')).toBe(false);
    expect(canonical.startsWith(`${FINANCE_HASH_VERSION}\n`)).toBe(true);
  });

  it('treats omitted optional fields as null', () => {
    const withMissing = canonicalizeFinanceRow('balance_snapshots', {
      accountId: 'acc_chase_checking',
      class: 'cash',
      asOf: '2026-07-31',
      balance: 1250.5,
      source: 'observed',
    });
    const withNulls = canonicalizeFinanceRow('balance_snapshots', {
      ...SNAPSHOT_FIELDS,
      accountName: null,
      method: null,
    });
    expect(withMissing).toBe(withNulls);
    expect(withMissing).toContain('accountName=null');
    expect(withMissing).toContain('method=null');
  });

  it('replaces newlines in strings with spaces', () => {
    const canonical = canonicalizeFinanceRow('transactions', {
      sourceId: 'txn_1',
      accountId: 'acc_1',
      kind: 'cash',
      date: '2026-07-31',
      amount: 12,
      direction: 'out',
      name: 'line1\nline2\rrest',
      merchant: null,
      category: null,
      pending: false,
    });
    expect(canonical).toContain('name=line1 line2 rest');
  });

  it('uses declared field order for every table', () => {
    expect([...FINANCE_FIELD_ORDER.accounts]).toEqual([
      'sourceId',
      'provider',
      'connectionId',
      'class',
      'name',
      'mask',
      'type',
      'subtype',
      'currentBalance',
      'availableBalance',
      'currency',
      'syncedAt',
      'coverageStart',
    ]);
    expect([...FINANCE_FIELD_ORDER.holdings]).toEqual([
      'accountId',
      'symbol',
      'qty',
      'value',
      'asOf',
    ]);
    expect([...FINANCE_FIELD_ORDER.flows]).toEqual([
      'flowId',
      'accountId',
      'date',
      'amount',
      'kind',
      'counterpartAccountId',
      'counterpartFlowId',
      'counterpartTxnId',
      'evidence',
      'externalToInvestable',
    ]);
    expect([...FINANCE_FIELD_ORDER.returns]).toEqual([
      'scope',
      'window',
      'asOf',
      'startDate',
      'cumulative',
      'annualized',
      'reliable',
      'startOnAnchor',
      'flowsFullyKnown',
      'method',
      'note',
    ]);
  });
});

describe('golden SHA-256 vectors', () => {
  it('locks the snapshot worked example', async () => {
    expect(canonicalizeFinanceRow('balance_snapshots', SNAPSHOT_FIELDS)).toBe(
      SNAPSHOT_CANONICAL,
    );
    expect(await sha256Hex(SNAPSHOT_CANONICAL)).toBe(SNAPSHOT_GOLDEN);
    expect(await financeContentHash('balance_snapshots', SNAPSHOT_FIELDS)).toBe(
      SNAPSHOT_GOLDEN,
    );
  });

  it('locks the accounts row vector', async () => {
    expect(canonicalizeFinanceRow('accounts', ACCOUNT_FIELDS)).toBe(ACCOUNT_CANONICAL);
    expect(await financeContentHash('accounts', ACCOUNT_FIELDS)).toBe(ACCOUNT_GOLDEN);
  });

  it('bucketHash sorts then joins with LF', async () => {
    expect(await bucketHash(['bb', 'aa', 'cc'])).toBe(
      'bb3a8f77129ee0d98b4f4a1026c8640a02deb6aba7b8baa743f17c586f13462c',
    );
    expect(await bucketHash([])).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('hash module is a single shared implementation', () => {
  it('exports the canonical recipe from hash.ts only', () => {
    const source = readFileSync(
      new URL('../convex/finance/hash.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('export async function financeContentHash');
    expect(source).toContain('export function canonicalizeFinanceRow');
  });
});
