/** Optional email-received time on a briefing item. Epoch milliseconds. */
export function parseReceivedAt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) return Math.trunc(numeric);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\u202f/g, ' ');
}

/**
 * Compact local timestamp: `9:42 AM` today, `Yesterday 4:10 PM`, `Oct 24`
 * (year added only when it is not the current year). Missing/invalid → null.
 */
export function formatReceivedAt(receivedAt: number | undefined | null, now = Date.now()): string | null {
  if (receivedAt == null || !Number.isFinite(receivedAt) || receivedAt <= 0) return null;
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(now);
  if (sameLocalDay(date, today)) return formatTime(date);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return `Yesterday ${formatTime(date)}`;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}
