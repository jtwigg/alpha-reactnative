/**
 * Per-class history coverage. Investment balances before these dates were
 * held flat (provider current-balance only). Do not read that flat stretch
 * as a gain.
 */
export const FINANCE_COVERAGE = {
  cash: {
    label: 'Cash',
    start: '2025-10-01',
    note: 'Bank history back to about October 2025.',
  },
  credit: {
    label: 'Credit',
    start: '2025-10-01',
    note: 'Card history back to about October 2025.',
  },
  liability: {
    label: 'Loans',
    start: '2025-10-01',
    note: 'Liability history back to about October 2025 where a feed exists.',
  },
  investments: {
    label: 'Investments',
    start: '2026-07-31',
    lateStart: '2026-10-12',
    note: 'Coverage begins 31 Jul 2026. Some accounts start 12 Oct 2026. Values before those dates are held flat and are not gains.',
  },
  real_estate: {
    label: 'Real estate',
    start: null,
    note: 'Manual values only — no provider history.',
  },
} as const;

export type FinanceClass = keyof typeof FINANCE_COVERAGE;

export function coverageForClass(className: string) {
  if (className in FINANCE_COVERAGE) {
    return FINANCE_COVERAGE[className as FinanceClass];
  }
  return {
    label: className,
    start: null as string | null,
    note: 'No coverage start recorded for this class.',
  };
}

export function isBeforeCoverage(
  asOf: string | null | undefined,
  className: string,
  accountCoverageStart?: string | null,
): boolean {
  if (!asOf) return false;
  const start = accountCoverageStart ?? coverageForClass(className).start;
  if (!start) return false;
  return asOf < start;
}

export const CLASS_LABELS: Record<string, string> = {
  cash: 'Cash',
  credit: 'Credit',
  liability: 'Loans',
  investments: 'Investments',
  real_estate: 'Home',
};

export function classLabel(className: string): string {
  return CLASS_LABELS[className] ?? className;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUsdSigned(amount: number): string {
  const abs = formatUsd(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `−${abs}`;
  return abs;
}

export function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const pct = value * 100;
  const body = `${Math.abs(pct).toFixed(1)}%`;
  if (pct > 0) return `+${body}`;
  if (pct < 0) return `−${body}`;
  return body;
}

/** Percentage points, e.g. a fraction 0.0123 → "+1.2 pp". */
export function formatPp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const pp = value * 100;
  const abs = Math.abs(pp);
  const body = `${abs > 0 && abs < 0.1 ? abs.toFixed(2) : abs.toFixed(1)} pp`;
  if (pp > 0) return `+${body}`;
  if (pp < 0) return `−${body}`;
  return body;
}

export function formatSynced(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCoverageDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
