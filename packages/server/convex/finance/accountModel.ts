import { todayInTimeZone } from './dates';
import { roundMoney, type SnapshotSource } from './hash';
import {
  accountValueOnDay,
  buildNetWorthModel,
  signedAmount,
  type ChartPoint,
  type RangeKey,
  type SeriesSnapshot,
} from './series';

export const ACCOUNT_LIST_CAP = 200;
export const TRANSACTIONS_PAGE_DEFAULT = 25;
export const TRANSACTIONS_PAGE_MAX = 100;
export const HOLDINGS_CAP = 500;

export type AccountGroupKey = 'cash' | 'investments' | 'real_estate' | 'liability' | 'other';

export const ACCOUNT_GROUPS: ReadonlyArray<{
  key: AccountGroupKey;
  label: string;
  classes: readonly string[];
}> = [
  { key: 'cash', label: 'Cash', classes: ['cash', 'depository'] },
  { key: 'investments', label: 'Investments', classes: ['investments', 'investment', 'brokerage'] },
  { key: 'real_estate', label: 'Property', classes: ['real_estate', 'property'] },
  { key: 'liability', label: 'Liabilities', classes: ['liability', 'credit', 'loan'] },
];

export function groupKeyForClass(className: string): AccountGroupKey {
  const hit = ACCOUNT_GROUPS.find((group) => group.classes.includes(className));
  return hit?.key ?? 'other';
}

export function groupLabel(key: AccountGroupKey): string {
  return ACCOUNT_GROUPS.find((group) => group.key === key)?.label ?? 'Other';
}

const PROVIDER_LABELS: Record<string, string> = {
  plaid: 'Plaid',
  manual: 'Manual entry',
  simplefin: 'SimpleFIN',
  finicity: 'Finicity',
  mx: 'MX',
};

/** Accounts carry no institution column; show the connection or provider. */
export function institutionLabel(provider: string, connectionId?: string): string {
  if (connectionId && !/^[a-z0-9_-]{16,}$/i.test(connectionId)) return connectionId;
  return PROVIDER_LABELS[provider.toLowerCase()] ?? titleCase(provider);
}

export function typeLabel(type: string, subtype?: string): string {
  const base = titleCase(type);
  if (!subtype || subtype.toLowerCase() === type.toLowerCase()) return base;
  return `${base} · ${titleCase(subtype)}`;
}

const ACRONYMS = new Set(['ira', 'hsa', 'fsa', '401k', '403b', '457b', '529', 'cd', 'ugma', 'utma', 'sep', 'llc', 'heloc']);

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export type AccountRecord = {
  sourceId: string;
  provider: string;
  connectionId?: string;
  class: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
  currentBalance: number;
  availableBalance?: number;
  currency: string;
  syncedAt: number;
  coverageStart?: string;
  updatedAt?: number;
};

export type LatestSnapshot = { asOf: string; balance: number; source: SnapshotSource } | null;

export type AccountListRow = {
  sourceId: string;
  name: string;
  mask: string | null;
  institution: string;
  type: string;
  class: string;
  currency: string;
  balance: number;
  signedBalance: number;
  lastUpdated: string;
  isManual: boolean;
};

export type AccountGroup = {
  key: AccountGroupKey;
  label: string;
  subtotal: number;
  count: number;
  accounts: AccountListRow[];
};

export type AccountListModel = {
  total: number;
  groups: AccountGroup[];
};

export function lastUpdatedDate(account: AccountRecord, latest: LatestSnapshot): string {
  const synced = todayInTimeZone(new Date(account.syncedAt));
  if (!latest) return synced;
  return latest.asOf > synced ? latest.asOf : synced;
}

export function toListRow(account: AccountRecord, latest: LatestSnapshot): AccountListRow {
  const balance = latest?.balance ?? account.currentBalance;
  return {
    sourceId: account.sourceId,
    name: account.name,
    mask: account.mask ?? null,
    institution: institutionLabel(account.provider, account.connectionId),
    type: typeLabel(account.type, account.subtype),
    class: account.class,
    currency: account.currency,
    balance: roundMoney(balance),
    signedBalance: roundMoney(signedAmount(account.class, balance)),
    lastUpdated: lastUpdatedDate(account, latest),
    isManual: account.provider === 'manual',
  };
}

export function groupAccounts(rows: AccountListRow[]): AccountListModel {
  const buckets = new Map<AccountGroupKey, AccountListRow[]>();
  for (const row of rows) {
    const key = groupKeyForClass(row.class);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  const order: AccountGroupKey[] = [...ACCOUNT_GROUPS.map((group) => group.key), 'other'];
  const groups: AccountGroup[] = [];
  let total = 0;
  for (const key of order) {
    const accounts = buckets.get(key);
    if (!accounts || accounts.length === 0) continue;
    accounts.sort(
      (a, b) => Math.abs(b.signedBalance) - Math.abs(a.signedBalance) || a.name.localeCompare(b.name),
    );
    const subtotal = roundMoney(accounts.reduce((sum, row) => sum + row.signedBalance, 0));
    total += subtotal;
    groups.push({ key, label: groupLabel(key), subtotal, count: accounts.length, accounts });
  }
  return { total: roundMoney(total), groups };
}

export type HoldingRecord = { symbol: string; qty: number; value: number; asOf: string };

export type HoldingRow = {
  symbol: string;
  name: string;
  quantity: number;
  price: number | null;
  value: number;
  pctOfAccount: number | null;
};

export type HoldingsModel = {
  asOf: string | null;
  total: number;
  rows: HoldingRow[];
};

/** `accountValue` is the account balance; fall back to the holdings sum. */
export function holdingsView(rows: HoldingRecord[], accountValue?: number): HoldingsModel {
  if (rows.length === 0) return { asOf: null, total: 0, rows: [] };
  const asOf = rows.reduce((max, row) => (row.asOf > max ? row.asOf : max), rows[0].asOf);
  const current = rows.filter((row) => row.asOf === asOf);
  const total = roundMoney(current.reduce((sum, row) => sum + row.value, 0));
  const denominator = accountValue && accountValue > 0 ? Math.max(accountValue, total) : total;
  const out = current
    .map((row) => ({
      symbol: row.symbol,
      name: row.symbol,
      quantity: row.qty,
      price: row.qty !== 0 ? row.value / row.qty : null,
      value: roundMoney(row.value),
      pctOfAccount: denominator > 0 ? row.value / denominator : null,
    }))
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));
  return { asOf, total, rows: out };
}

export type AccountHistory = {
  range: RangeKey;
  asOf: string;
  points: ChartPoint[];
  change: number;
  changePct: number | null;
  firstAsOf: string | null;
};

/** Raw (unsigned) balance history for one account on the shared range grid. */
export function accountHistory(args: {
  account: AccountRecord;
  snapshots: SeriesSnapshot[];
  range: RangeKey;
  asOf: string;
}): AccountHistory {
  const model = buildNetWorthModel({
    accounts: [
      {
        sourceId: args.account.sourceId,
        name: args.account.name,
        class: 'cash',
        provider: args.account.provider,
        currentBalance: args.account.currentBalance,
        currency: args.account.currency,
        syncedAt: args.account.syncedAt,
        coverageStart: args.account.coverageStart,
      },
    ],
    snapshots: args.snapshots,
    range: args.range,
    asOf: args.asOf,
  });
  const points = model.points.map((point) => ({
    asOf: point.asOf,
    total: point.total,
    interpolated: point.interpolated,
    byClass: {},
  }));
  return {
    range: args.range,
    asOf: args.asOf,
    points,
    change: model.change,
    changePct: model.changePct,
    firstAsOf: model.accounts[0]?.firstAsOf ?? null,
  };
}

export const SPARKLINE_POINTS = 40;

export type ChangeTone = 'good' | 'bad' | 'flat';

export type SparklineRow = {
  sourceId: string;
  values: Array<number | null>;
  change: number;
  changePct: number | null;
  tone: ChangeTone;
};

/** Shrinking liabilities are good; for everything else growth is good. */
export function changeTone(className: string, change: number): ChangeTone {
  if (Math.abs(change) < 0.005) return 'flat';
  const shrinkIsGood = groupKeyForClass(className) === 'liability';
  return (change > 0) !== shrinkIsGood ? 'good' : 'bad';
}

/**
 * Unsigned balance per date for each account. Values before an account's
 * first snapshot are null. Change compares the first covered point in the
 * range with the last point.
 */
export function sparklineRows(args: {
  accounts: Array<{ sourceId: string; class: string }>;
  snapshots: SeriesSnapshot[];
  dates: string[];
}): SparklineRow[] {
  const byAccount = new Map<string, SeriesSnapshot[]>();
  for (const row of args.snapshots) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }
  return args.accounts.map((account) => {
    const snaps = (byAccount.get(account.sourceId) ?? []).sort((a, b) => a.asOf.localeCompare(b.asOf));
    const latest = snaps.at(-1);
    const values = args.dates.map((day) => {
      if (!latest) return null;
      const hit = accountValueOnDay(snaps, day, latest);
      return hit ? roundMoney(hit.balance) : null;
    });
    const covered = values.filter((value): value is number => value != null);
    const start = covered[0];
    const end = covered.at(-1);
    const change = start == null || end == null ? 0 : roundMoney(end - start);
    const changePct =
      start == null || end == null || Math.abs(start) < 0.005 ? null : change / Math.abs(start);
    return {
      sourceId: account.sourceId,
      values,
      change,
      changePct,
      tone: changeTone(account.class, change),
    };
  });
}

const INFLOW = new Set(['credit', 'in', 'inflow', 'deposit', 'income']);
const OUTFLOW = new Set(['debit', 'out', 'outflow', 'withdrawal', 'expense']);

/**
 * Signed from the account holder's view: money in is positive. Falls back to
 * the Plaid convention (positive `amount` = money out) when `direction` is
 * not recognised.
 */
export function displayAmount(amount: number, direction: string): number {
  const key = direction.trim().toLowerCase();
  if (INFLOW.has(key)) return Math.abs(amount);
  if (OUTFLOW.has(key)) return -Math.abs(amount);
  return -amount;
}

export function groupByDate<T extends { date: string }>(rows: T[]): Array<{ date: string; rows: T[] }> {
  const out: Array<{ date: string; rows: T[] }> = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else out.push({ date: row.date, rows: [row] });
  }
  return out;
}

export function clampPageSize(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested)) return TRANSACTIONS_PAGE_DEFAULT;
  return Math.min(Math.max(Math.floor(requested), 1), TRANSACTIONS_PAGE_MAX);
}
