import { addDays, daysBetween } from './dates';

/** Posted rows match a pending row dated at most this many days away. */
export const PENDING_MATCH_DAYS = 5;

export type PendingMatch = 'pending_transaction_id' | 'fuzzy';

export type TxnLike = {
  sourceId: string;
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchant?: string;
  pending: boolean;
};

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizePayee(value: string | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sameCents(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

/** Same merchant when both rows have one, otherwise the same name. */
export function samePayee(left: Pick<TxnLike, 'name' | 'merchant'>, right: Pick<TxnLike, 'name' | 'merchant'>): boolean {
  const leftMerchant = normalizePayee(left.merchant);
  const rightMerchant = normalizePayee(right.merchant);
  if (leftMerchant && rightMerchant) return leftMerchant === rightMerchant;
  const leftName = normalizePayee(left.name);
  return leftName !== '' && leftName === normalizePayee(right.name);
}

export function pendingWindow(date: string): { from: string; to: string } {
  return { from: addDays(date, -PENDING_MATCH_DAYS), to: addDays(date, PENDING_MATCH_DAYS) };
}

/**
 * The single pending row a newly posted transaction replaces: same account,
 * same amount to the cent, same normalized payee, dated within 5 days.
 * Closest date wins; ties prefer the pending row dated on/before the posted
 * date (pending usually precedes posting), then the lowest sourceId.
 */
export function pickPendingMatch<T extends TxnLike>(
  posted: TxnLike,
  candidates: T[],
  excluded: ReadonlySet<string> = new Set(),
): T | null {
  let best: { row: T; distance: number; after: boolean } | null = null;
  for (const row of candidates) {
    if (!row.pending || row.accountId !== posted.accountId || row.sourceId === posted.sourceId) continue;
    if (excluded.has(row.sourceId)) continue;
    if (!sameCents(row.amount, posted.amount) || !samePayee(row, posted)) continue;
    const offset = daysBetween(row.date, posted.date);
    const distance = Math.abs(offset);
    if (distance > PENDING_MATCH_DAYS) continue;
    const after = offset < 0;
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && best.after && !after) ||
      (distance === best.distance && best.after === after && row.sourceId < best.row.sourceId)
    ) {
      best = { row, distance, after };
    }
  }
  return best?.row ?? null;
}

/** Explicit link from the provider: must be a pending row on the same account. */
export function isLinkedPending(posted: Pick<TxnLike, 'accountId'>, row: TxnLike | null): boolean {
  return row != null && row.pending && row.accountId === posted.accountId;
}
