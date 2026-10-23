/**
 * Invented household for layout / screenshot only. Not real balances,
 * addresses, or account numbers.
 */
import {
  accountHistory,
  groupAccounts,
  holdingsView,
  SPARKLINE_POINTS,
  institutionLabel,
  groupKeyForClass,
  addContributions,
  groupSparklines,
  sparklineRows,
  stackGrid,
  toListRow,
  typeLabel,
  type AccountListModel,
  type AccountRecord,
  type HoldingsModel,
  type WeightedSparklines,
} from '../../server/convex/finance/accountModel';
import {
  buildNetWorthModel,
  chartDates,
  rangeWindow,
  strideChartDates,
  type NetWorthPageModel,
  type RangeKey,
  type SeriesAccount,
  type SeriesSnapshot,
} from '../../server/convex/finance/series';

const AS_OF = '2026-10-23';
const SYNCED = Date.UTC(2026, 9, 23);

const accounts: SeriesAccount[] = [
  {
    sourceId: 'acc_home',
    name: 'Maple Street home',
    class: 'real_estate',
    provider: 'manual',
    currentBalance: 625_000,
    syncedAt: SYNCED,
    coverageStart: '2019-06-01',
  },
  {
    sourceId: 'acc_mortgage',
    name: 'Home mortgage',
    class: 'liability',
    provider: 'manual',
    currentBalance: 268_400,
    syncedAt: SYNCED,
    coverageStart: '2019-06-01',
  },
  {
    sourceId: 'acc_checking',
    name: 'Everyday checking',
    class: 'cash',
    provider: 'plaid',
    currentBalance: 6_140,
    syncedAt: SYNCED,
    coverageStart: '2025-10-01',
  },
  {
    sourceId: 'acc_savings',
    name: 'High-yield savings',
    class: 'cash',
    provider: 'plaid',
    currentBalance: 28_750,
    syncedAt: SYNCED,
    coverageStart: '2025-10-01',
  },
  {
    sourceId: 'acc_emergency',
    name: 'Emergency fund',
    class: 'cash',
    provider: 'plaid',
    currentBalance: 12_200,
    syncedAt: SYNCED,
    coverageStart: '2025-10-01',
  },
  {
    sourceId: 'acc_visa',
    name: 'Visa · 4242',
    class: 'credit',
    provider: 'plaid',
    currentBalance: 1_840,
    syncedAt: SYNCED,
    coverageStart: '2025-10-01',
  },
  {
    sourceId: 'acc_auto',
    name: 'Auto loan',
    class: 'liability',
    provider: 'manual',
    currentBalance: 9_600,
    syncedAt: SYNCED,
    coverageStart: '2023-03-01',
  },
  {
    sourceId: 'acc_brokerage',
    name: 'Taxable brokerage',
    class: 'investments',
    provider: 'plaid',
    currentBalance: 84_200,
    syncedAt: SYNCED,
    coverageStart: '2026-07-31',
  },
  {
    sourceId: 'acc_ira',
    name: 'Traditional IRA',
    class: 'investments',
    provider: 'plaid',
    currentBalance: 61_500,
    syncedAt: SYNCED,
    coverageStart: '2026-07-31',
  },
  {
    sourceId: 'acc_roth',
    name: 'Roth IRA',
    class: 'investments',
    provider: 'plaid',
    currentBalance: 22_100,
    syncedAt: SYNCED,
    coverageStart: '2026-07-31',
  },
  {
    sourceId: 'acc_401k',
    name: 'Workplace 401(k)',
    class: 'investments',
    provider: 'plaid',
    currentBalance: 118_400,
    syncedAt: SYNCED,
    coverageStart: '2026-10-12',
  },
  {
    sourceId: 'acc_hsa',
    name: 'HSA',
    class: 'investments',
    provider: 'plaid',
    currentBalance: 7_350,
    syncedAt: SYNCED,
    coverageStart: '2026-10-12',
  },
];

const snapshots: SeriesSnapshot[] = [
  { accountId: 'acc_home', asOf: '2019-06-01', balance: 420_000, source: 'manual' },
  { accountId: 'acc_home', asOf: '2021-01-15', balance: 465_000, source: 'manual' },
  { accountId: 'acc_home', asOf: '2022-06-01', balance: 535_000, source: 'manual' },
  { accountId: 'acc_home', asOf: '2024-06-01', balance: 590_000, source: 'manual' },
  { accountId: 'acc_home', asOf: '2026-01-01', balance: 625_000, source: 'manual' },

  { accountId: 'acc_mortgage', asOf: '2019-06-01', balance: 336_000, source: 'manual' },
  { accountId: 'acc_mortgage', asOf: '2021-01-15', balance: 318_000, source: 'manual' },
  { accountId: 'acc_mortgage', asOf: '2022-06-01', balance: 304_500, source: 'manual' },
  { accountId: 'acc_mortgage', asOf: '2024-06-01', balance: 286_200, source: 'manual' },
  { accountId: 'acc_mortgage', asOf: '2026-01-01', balance: 272_800, source: 'manual' },
  { accountId: 'acc_mortgage', asOf: '2026-10-23', balance: 268_400, source: 'manual' },

  { accountId: 'acc_auto', asOf: '2023-03-01', balance: 24_800, source: 'manual' },
  { accountId: 'acc_auto', asOf: '2024-03-01', balance: 18_900, source: 'manual' },
  { accountId: 'acc_auto', asOf: '2025-03-01', balance: 13_400, source: 'manual' },
  { accountId: 'acc_auto', asOf: '2026-10-23', balance: 9_600, source: 'manual' },

  { accountId: 'acc_checking', asOf: '2025-10-01', balance: 4_180, source: 'observed' },
  { accountId: 'acc_checking', asOf: '2026-01-15', balance: 5_420, source: 'observed' },
  { accountId: 'acc_checking', asOf: '2026-04-01', balance: 3_960, source: 'observed' },
  { accountId: 'acc_checking', asOf: '2026-07-01', balance: 5_880, source: 'observed' },
  { accountId: 'acc_checking', asOf: '2026-10-23', balance: 6_140, source: 'observed' },

  { accountId: 'acc_savings', asOf: '2025-10-01', balance: 18_400, source: 'observed' },
  { accountId: 'acc_savings', asOf: '2026-03-01', balance: 22_100, source: 'observed' },
  { accountId: 'acc_savings', asOf: '2026-08-01', balance: 26_350, source: 'observed' },
  { accountId: 'acc_savings', asOf: '2026-10-23', balance: 28_750, source: 'observed' },

  { accountId: 'acc_emergency', asOf: '2025-10-01', balance: 10_000, source: 'observed' },
  { accountId: 'acc_emergency', asOf: '2026-06-01', balance: 11_400, source: 'observed' },
  { accountId: 'acc_emergency', asOf: '2026-10-23', balance: 12_200, source: 'observed' },

  { accountId: 'acc_visa', asOf: '2025-10-01', balance: 2_240, source: 'observed' },
  { accountId: 'acc_visa', asOf: '2026-02-01', balance: 1_120, source: 'observed' },
  { accountId: 'acc_visa', asOf: '2026-06-15', balance: 2_680, source: 'observed' },
  { accountId: 'acc_visa', asOf: '2026-10-23', balance: 1_840, source: 'observed' },

  // Brokerage: Jul 31 start, then a gap so the chart draws a dashed bridge.
  { accountId: 'acc_brokerage', asOf: '2026-07-31', balance: 71_400, source: 'observed' },
  { accountId: 'acc_brokerage', asOf: '2026-09-18', balance: 79_800, source: 'observed' },
  { accountId: 'acc_brokerage', asOf: '2026-10-23', balance: 84_200, source: 'observed' },

  { accountId: 'acc_ira', asOf: '2026-07-31', balance: 54_200, source: 'reconstructed' },
  { accountId: 'acc_ira', asOf: '2026-10-23', balance: 61_500, source: 'observed' },

  { accountId: 'acc_roth', asOf: '2026-07-31', balance: 19_600, source: 'observed' },
  { accountId: 'acc_roth', asOf: '2026-10-23', balance: 22_100, source: 'observed' },

  { accountId: 'acc_401k', asOf: '2026-10-12', balance: 116_800, source: 'observed' },
  { accountId: 'acc_401k', asOf: '2026-10-23', balance: 118_400, source: 'observed' },

  { accountId: 'acc_hsa', asOf: '2026-10-12', balance: 7_180, source: 'observed' },
  { accountId: 'acc_hsa', asOf: '2026-10-23', balance: 7_350, source: 'observed' },
];

export function demoNetWorthPage(range: RangeKey = 'All'): NetWorthPageModel {
  return buildNetWorthModel({
    accounts,
    snapshots,
    range,
    asOf: AS_OF,
  });
}

const EXTRA: Record<string, { type: string; subtype?: string; mask?: string; connectionId?: string; available?: number }> = {
  acc_home: { type: 'property', subtype: 'primary residence' },
  acc_mortgage: { type: 'loan', subtype: 'mortgage', mask: '8812' },
  acc_checking: { type: 'depository', subtype: 'checking', mask: '0119', connectionId: 'Harbor Credit Union', available: 5_980 },
  acc_savings: { type: 'depository', subtype: 'savings', mask: '7730', connectionId: 'Harbor Credit Union', available: 28_750 },
  acc_emergency: { type: 'depository', subtype: 'money market', mask: '5521', connectionId: 'Summit Bank' },
  acc_visa: { type: 'credit', subtype: 'credit card', mask: '4242', connectionId: 'Summit Bank', available: 13_160 },
  acc_auto: { type: 'loan', subtype: 'auto', mask: '3307' },
  acc_brokerage: { type: 'investment', subtype: 'brokerage', mask: '6401', connectionId: 'Northwind Investing' },
  acc_ira: { type: 'investment', subtype: 'ira', mask: '2290', connectionId: 'Northwind Investing' },
  acc_roth: { type: 'investment', subtype: 'roth', mask: '2291', connectionId: 'Northwind Investing' },
  acc_401k: { type: 'investment', subtype: '401k', mask: '9010', connectionId: 'Contoso Retirement' },
  acc_hsa: { type: 'investment', subtype: 'hsa', mask: '1188', connectionId: 'Contoso Retirement' },
};

function demoRecord(sourceId: string): AccountRecord | null {
  const account = accounts.find((row) => row.sourceId === sourceId);
  if (!account) return null;
  const extra = EXTRA[sourceId] ?? { type: account.class };
  return {
    sourceId,
    provider: account.provider,
    connectionId: extra.connectionId,
    class: account.class,
    name: account.name,
    mask: extra.mask,
    type: extra.type,
    subtype: extra.subtype,
    currentBalance: account.currentBalance,
    availableBalance: extra.available,
    currency: 'USD',
    syncedAt: account.syncedAt,
    coverageStart: account.coverageStart,
    updatedAt: account.syncedAt,
  };
}

function latestFor(sourceId: string) {
  const rows = snapshots.filter((row) => row.accountId === sourceId).sort((a, b) => a.asOf.localeCompare(b.asOf));
  const last = rows[rows.length - 1];
  return last ? { asOf: last.asOf, balance: last.balance, source: last.source } : null;
}

export function demoAccountList(): AccountListModel {
  return groupAccounts(
    accounts.map((account) => toListRow(demoRecord(account.sourceId)!, latestFor(account.sourceId))),
  );
}

export function demoAccountSparklines(range: RangeKey): {
  dates: string[];
  rows: WeightedSparklines['rows'];
  groups: WeightedSparklines['groups'];
} {
  const earliest = snapshots.reduce<string | null>((min, row) => (min == null || row.asOf < min ? row.asOf : min), null);
  const window = rangeWindow(range, AS_OF, earliest);
  const dates = strideChartDates(chartDates(range, window.from, window.to), SPARKLINE_POINTS);
  const rows = sparklineRows({ accounts, snapshots, dates });
  return { dates, ...addContributions(accounts, rows, groupSparklines(accounts, rows)) };
}

export function demoStack(from?: string, to?: string) {
  const firstAsOf = snapshots.reduce<string | null>((min, row) => (min == null || row.asOf < min ? row.asOf : min), null);
  const grid = stackGrid({ firstAsOf, asOf: AS_OF, from, to });
  const rows = sparklineRows({ accounts, snapshots, dates: grid.dates });
  return {
    asOf: AS_OF,
    firstAsOf,
    ...grid,
    accounts: accounts.map((account, index) => ({
      sourceId: account.sourceId,
      name: account.name,
      class: account.class,
      group: groupKeyForClass(account.class),
      values: rows[index].values,
    })),
    documentsRead: 0,
  };
}

export function demoAccountDetail(sourceId: string, range: RangeKey): DemoAccountDetail | null {
  const record = demoRecord(sourceId);
  if (!record) return null;
  const own = snapshots.filter((row) => row.accountId === sourceId);
  return {
    sourceId,
    name: record.name,
    institution: institutionLabel(record.provider, record.connectionId),
    typeLabel: typeLabel(record.type, record.subtype),
    provider: record.provider,
    connectionId: record.connectionId ?? null,
    class: record.class,
    mask: record.mask ?? null,
    type: record.type,
    subtype: record.subtype ?? null,
    currentBalance: record.currentBalance,
    availableBalance: record.availableBalance ?? null,
    currency: record.currency,
    syncedAt: record.syncedAt,
    updatedAt: record.updatedAt ?? record.syncedAt,
    coverageStart: record.coverageStart ?? null,
    latestSnapshot: latestFor(sourceId),
    history: accountHistory({ account: record, snapshots: own, range, asOf: AS_OF }),
  };
}

export type DemoAccountDetail = {
  sourceId: string;
  name: string;
  institution: string;
  typeLabel: string;
  provider: string;
  connectionId: string | null;
  class: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number;
  availableBalance: number | null;
  currency: string;
  syncedAt: number;
  updatedAt: number;
  coverageStart: string | null;
  latestSnapshot: { asOf: string; balance: number; source: SeriesSnapshot['source'] } | null;
  history: ReturnType<typeof accountHistory>;
};

export type DemoTransaction = {
  _id: string;
  sourceId: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  direction: string;
  category: string | null;
  pending: boolean;
  kind: 'cash' | 'liability' | 'portfolio';
};

const MERCHANTS: Array<[string, string, number]> = [
  ['Blue Bottle Coffee', 'Food & drink', 6.75],
  ['Trader Joe’s', 'Groceries', 84.12],
  ['City Power & Light', 'Utilities', 112.4],
  ['Payroll deposit', 'Income', -3_820],
  ['Shell', 'Transportation', 52.3],
  ['Netflix', 'Subscriptions', 15.49],
  ['Lyft', 'Transportation', 18.9],
  ['Whole Foods Market', 'Groceries', 61.08],
  ['Transfer to savings', 'Transfer', 500],
  ['Amazon', 'Shopping', 42.99],
  ['Pharmacy', 'Health', 23.5],
  ['Interest paid', 'Income', -4.12],
];

export function demoTransactions(sourceId: string): DemoTransaction[] {
  const record = demoRecord(sourceId);
  if (!record || record.class === 'real_estate') return [];
  const kind = record.class === 'investments' ? 'portfolio' : record.class === 'liability' ? 'liability' : 'cash';
  const out: DemoTransaction[] = [];
  const seed = sourceId.length;
  for (let i = 0; i < 64; i += 1) {
    const day = new Date(Date.UTC(2026, 9, 23 - Math.floor(i * 1.6)));
    let description: string;
    let category: string;
    let amount: number;
    if (kind === 'portfolio') {
      const options: Array<[string, string, number]> = [
        ['Dividend · VTI', 'Dividend', -42.18],
        ['Buy · VXUS', 'Trade', 500],
        ['Contribution', 'Transfer', -1_000],
        ['Dividend · BND', 'Dividend', -18.6],
      ];
      [description, category, amount] = options[(i + seed) % options.length];
    } else if (kind === 'liability') {
      [description, category, amount] = i % 2 === 0 ? ['Scheduled payment', 'Loan payment', -640] : ['Interest', 'Interest', 92.4];
    } else {
      [description, category, amount] = MERCHANTS[(i * 5 + seed) % MERCHANTS.length];
    }
    out.push({
      _id: `${sourceId}_tx_${i}`,
      sourceId: `${sourceId}_tx_${i}`,
      date: day.toISOString().slice(0, 10),
      description,
      merchant: description,
      amount,
      direction: amount < 0 ? 'credit' : 'debit',
      category,
      pending: i < 2 && kind === 'cash',
      kind,
    });
  }
  return out;
}

const HOLDING_MIX: Array<[string, number, number]> = [
  ['VTI', 0.42, 287.4],
  ['VXUS', 0.21, 66.2],
  ['BND', 0.14, 73.1],
  ['AAPL', 0.09, 231.5],
  ['MSFT', 0.08, 428.9],
];

export function demoHoldings(sourceId: string): HoldingsModel {
  const record = demoRecord(sourceId);
  if (!record || record.class !== 'investments') return { asOf: null, total: 0, rows: [] };
  const balance = record.currentBalance;
  const rows = HOLDING_MIX.map(([symbol, weight, price]) => {
    const qty = Math.round(((balance * weight) / price) * 1000) / 1000;
    return { symbol, qty, value: Math.round(qty * price * 100) / 100, asOf: AS_OF };
  });
  return holdingsView(rows, balance);
}
