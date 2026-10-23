import type { AccountGroupKey } from '../../server/convex/finance/accountModel';

export type StackLevel = 'group' | 'account';

export type StackAccount = {
  sourceId: string;
  name: string;
  class: string;
  group: AccountGroupKey;
  values: (number | null)[];
};

export type StackSeries = {
  key: string;
  label: string;
  group: AccountGroupKey;
  color: string;
  /** Signed: loans are negative so they stack below zero. */
  values: number[];
};

export type StackModel = {
  series: StackSeries[];
  /** Sum of positive parts per date. */
  positive: number[];
  /** Sum of negative parts per date (≤ 0). */
  negative: number[];
  net: number[];
  /** False where no account had data yet. */
  covered: boolean[];
};

const GROUP_ORDER: AccountGroupKey[] = ['cash', 'investments', 'real_estate', 'other', 'liability'];

export const STACK_GROUP_LABELS: Record<AccountGroupKey, string> = {
  cash: 'Cash',
  investments: 'Investments',
  real_estate: 'Property',
  liability: 'Loans',
  other: 'Other',
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lightens `base` toward white; index 0 is the base color. */
export function shade(base: string, index: number, count: number): string {
  if (count <= 1 || index === 0) return base;
  const t = (index / (count - 1)) * 0.6;
  const [r, g, b] = hexToRgb(base).map((c) => Math.round(c + (255 - c) * t));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const lastKnown = (values: (number | null)[]) => {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null) return values[i] as number;
  return 0;
};

/**
 * Stack order is Cash, Investments, Property (bottom up) with Loans stacked
 * downward from zero. Within a group the largest account sits nearest zero.
 */
export function buildStack(args: {
  accounts: StackAccount[];
  level: StackLevel;
  includeLoans: boolean;
  groupColors: Record<AccountGroupKey, string>;
}): StackModel {
  const length = Math.max(0, ...args.accounts.map((a) => a.values.length));
  const covered = Array.from({ length }, (_, i) => args.accounts.some((a) => a.values[i] != null));
  const series: StackSeries[] = [];

  for (const group of GROUP_ORDER) {
    if (group === 'liability' && !args.includeLoans) continue;
    const members = args.accounts
      .filter((a) => a.group === group)
      .sort((a, b) => Math.abs(lastKnown(b.values)) - Math.abs(lastKnown(a.values)));
    if (members.length === 0) continue;
    const sign = group === 'liability' ? -1 : 1;
    const signed = (value: number | null) => (value == null ? 0 : sign * Math.abs(value));
    const base = args.groupColors[group];
    if (args.level === 'group') {
      series.push({
        key: group,
        label: STACK_GROUP_LABELS[group],
        group,
        color: base,
        values: Array.from({ length }, (_, i) => members.reduce((sum, a) => sum + signed(a.values[i]), 0)),
      });
    } else {
      members.forEach((account, index) => {
        series.push({
          key: account.sourceId,
          label: account.name,
          group,
          color: shade(base, index, members.length),
          values: Array.from({ length }, (_, i) => signed(account.values[i])),
        });
      });
    }
  }

  const positive = Array.from({ length }, (_, i) =>
    series.reduce((sum, s) => sum + Math.max(s.values[i], 0), 0),
  );
  const negative = Array.from({ length }, (_, i) =>
    series.reduce((sum, s) => sum + Math.min(s.values[i], 0), 0),
  );
  const net = positive.map((value, i) => value + negative[i]);
  return { series, positive, negative, net, covered };
}

/** Index window into `dates` covering [from, to]. */
export function windowIndexes(dates: string[], from: string, to: string): [number, number] {
  if (dates.length === 0) return [0, 0];
  let start = dates.findIndex((date) => date >= from);
  if (start < 0) start = dates.length - 1;
  let end = dates.length - 1;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    if (dates[i] <= to) {
      end = i;
      break;
    }
  }
  return [Math.min(start, end), Math.max(start, end)];
}

/** Moves one navigator handle by `deltaIndex`, keeping at least `minGap` steps open. */
export function dragWindow(
  start: number,
  end: number,
  part: 'start' | 'end' | 'body',
  deltaIndex: number,
  count: number,
  minGap = 1,
): [number, number] {
  const last = Math.max(count - 1, 0);
  const gap = Math.min(minGap, last);
  if (part === 'start') return [Math.min(Math.max(start + deltaIndex, 0), end - gap), end];
  if (part === 'end') return [start, Math.max(Math.min(end + deltaIndex, last), start + gap)];
  const width = end - start;
  const nextStart = Math.min(Math.max(start + deltaIndex, 0), last - width);
  return [nextStart, nextStart + width];
}
