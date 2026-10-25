const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}

export function parseIsoDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) {
    throw new Error(`Expected YYYY-MM-DD, got ${iso}`);
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date ${iso}`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const FINANCE_TIME_ZONE = 'America/Los_Angeles';

/** Calendar date in `timeZone`. Never use UTC `toISOString().slice(0, 10)`. */
export function todayInTimeZone(
  now: Date = new Date(),
  timeZone: string = FINANCE_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not format ${timeZone} date`);
  }
  return `${year}-${month}-${day}`;
}

export function eachWeek(from: string, to: string): string[] {
  parseIsoDate(from);
  parseIsoDate(to);
  if (to < from) return [];
  const out: string[] = [from];
  let cursor = addDays(from, 7);
  while (cursor < to) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000,
  );
}

export function eachDate(from: string, to: string): string[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (end.getTime() < start.getTime()) {
    return [];
  }
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function monthOf(isoDate: string): string {
  if (ISO_MONTH.test(isoDate) && isoDate.length === 7) {
    return isoDate;
  }
  parseIsoDate(isoDate);
  return isoDate.slice(0, 7);
}

export function monthStart(monthOrDate: string): string {
  if (ISO_MONTH.test(monthOrDate)) {
    return `${monthOrDate}-01`;
  }
  parseIsoDate(monthOrDate);
  return `${monthOrDate.slice(0, 7)}-01`;
}

export function monthEnd(monthOrDate: string): string {
  const month = ISO_MONTH.test(monthOrDate)
    ? monthOrDate
    : monthOf(monthOrDate);
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  return formatIsoDate(new Date(Date.UTC(year, mon, 0)));
}

export function monthFromTimestampMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** Accept `YYYY-MM` or `YYYY-MM-DD`; return inclusive ISO date bounds. */
export function rangeBounds(
  from?: string,
  to?: string,
): { fromDate?: string; toDate?: string; fromMonth?: string; toMonth?: string } {
  const fromDate = from
    ? ISO_MONTH.test(from)
      ? monthStart(from)
      : (parseIsoDate(from), from)
    : undefined;
  const toDate = to
    ? ISO_MONTH.test(to)
      ? monthEnd(to)
      : (parseIsoDate(to), to)
    : undefined;
  return {
    fromDate,
    toDate,
    fromMonth: fromDate ? monthOf(fromDate) : undefined,
    toMonth: toDate ? monthOf(toDate) : undefined,
  };
}

export function monthInRange(
  month: string,
  fromMonth?: string,
  toMonth?: string,
): boolean {
  if (fromMonth && month < fromMonth) return false;
  if (toMonth && month > toMonth) return false;
  return true;
}

export function addMonths(monthOrDate: string, delta: number): string {
  const month = monthOf(monthOrDate);
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${mo}`;
}

/** Inclusive YYYY-MM range. */
export function eachMonth(fromMonth: string, toMonth: string): string[] {
  const start = monthOf(fromMonth);
  const end = monthOf(toMonth);
  if (end < start) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
    if (out.length > 2400) {
      throw new Error('eachMonth: span exceeds 200 years');
    }
  }
  return out;
}

/** Monday (UTC) of the ISO week that contains `iso`. */
export function weekStart(iso: string): string {
  const date = parseIsoDate(iso);
  const dow = date.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, offset);
}

/** Sunday (UTC) of the ISO week that contains `iso`. */
export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

/**
 * Canonical month-end dates in `[from, to]`, always including `from` and `to`
 * so a chart has endpoints even when the window starts mid-month.
 */
export function eachMonthEnd(from: string, to: string): string[] {
  parseIsoDate(from);
  parseIsoDate(to);
  if (to < from) return [];
  const out: string[] = [from];
  for (const month of eachMonth(from, to)) {
    const end = monthEnd(month);
    if (end > from && end < to) out.push(end);
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

/**
 * Canonical ISO week-end (Sunday) dates in `[from, to]`, always including
 * `from` and `to`.
 */
export function eachWeekEnd(from: string, to: string): string[] {
  parseIsoDate(from);
  parseIsoDate(to);
  if (to < from) return [];
  const out: string[] = [from];
  let end = weekEnd(from);
  while (end < to) {
    if (end > from) out.push(end);
    end = addDays(end, 7);
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}
