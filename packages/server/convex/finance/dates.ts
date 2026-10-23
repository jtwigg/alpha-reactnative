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
