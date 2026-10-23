/**
 * Invented household for layout / screenshot only. Not real balances,
 * addresses, or account numbers.
 */
import {
  buildNetWorthModel,
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
