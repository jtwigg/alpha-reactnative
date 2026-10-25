/**
 * Canonical finance row hashing.
 *
 * Every finance document stores `contentHash` = SHA-256 (lowercase hex) of the
 * UTF-8 bytes of `canonicalizeFinanceRow(table, fields)`.
 *
 * Excluded from the hash: `_id`, `_creationTime`, `updatedAt`, `contentHash`.
 *
 * Byte recipe (v1), in order:
 *   1. Lines are joined with a single LF (`\n`, U+000A). No CR. No trailing LF
 *      after the last field line.
 *   2. Line 1 is the ASCII header `finance.v1`.
 *   3. Line 2 is the table name (`accounts` | `balance_snapshots` |
 *      `transactions` | `holdings` | `flows` | `returns` | `series`).
 *   4. Then one `name=value` line per business field, in the **declared**
 *      order for that table (not sorted at runtime). Accounts include
 *      `provider` immediately after `sourceId`; manual accounts hash
 *      `connectionId=null`.
 *   5. Value encoding:
 *        - missing / undefined / null → the 4-byte ASCII token `null`
 *        - string → UTF-8 as-is after `\r` and `\n` are replaced with space
 *        - boolean → `true` or `false`
 *        - date (`asOf`, `date`) → `YYYY-MM-DD`
 *        - money (`currentBalance`, `availableBalance`, `balance`, `amount`,
 *          `qty`, `value`, `netInvested`, `sp500Equiv`) → fixed 8 decimals, no exponent, no thousands
 *          separator, `-` if negative, no `+`. Zero is `0.00000000`.
 *          `-0` is `0.00000000`. Rounded half away from zero via
 *          `Math.round(abs * 1e8)`.
 *        - integer (`syncedAt`) → base-10 `Math.trunc`, no leading zeros,
 *          no `+`. Zero is `0`.
 *   6. SHA-256 over the UTF-8 encoding of that string; digest printed as
 *      64 lowercase hex characters.
 *
 * Worked example (balance_snapshots):
 *   fields = {
 *     accountId: "acc_chase_checking",
 *     accountName: "Checking",
 *     class: "cash",
 *     asOf: "2026-07-31",
 *     balance: 1250.5,
 *     source: "observed",
 *     method: null,
 *   }
 *   canonical =
 *     "finance.v1\n" +
 *     "balance_snapshots\n" +
 *     "accountId=acc_chase_checking\n" +
 *     "accountName=Checking\n" +
 *     "class=cash\n" +
 *     "asOf=2026-07-31\n" +
 *     "balance=1250.50000000\n" +
 *     "source=observed\n" +
 *     "method=null"
 *   contentHash =
 *     "464340342d1c6d10da6462882b7d7a0d945fd3a2062906a4fe70370643c5790c"
 *   (155 UTF-8 bytes, no trailing LF. Golden vectors also live in
 *   packages/server/tests/finance-hash.test.ts.)
 */

export const FINANCE_HASH_VERSION = 'finance.v1' as const;

export const FINANCE_TABLES = [
  'accounts',
  'balance_snapshots',
  'transactions',
  'holdings',
  'flows',
  'returns',
  'series',
] as const;

export type FinanceTable = (typeof FINANCE_TABLES)[number];

export const SNAPSHOT_SOURCES = [
  'manual',
  'observed',
  'reconstructed',
  'interpolated',
] as const;

export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

export const SNAPSHOT_PRECEDENCE: Record<SnapshotSource, number> = {
  interpolated: 0,
  reconstructed: 1,
  observed: 2,
  manual: 3,
};

const ACCOUNT_FIELDS = [
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
] as const;

const SNAPSHOT_FIELDS = [
  'accountId',
  'accountName',
  'class',
  'asOf',
  'balance',
  'source',
  'method',
] as const;

const TRANSACTION_FIELDS = [
  'sourceId',
  'accountId',
  'kind',
  'date',
  'amount',
  'direction',
  'name',
  'merchant',
  'category',
  'pending',
] as const;

const HOLDING_FIELDS = [
  'accountId',
  'symbol',
  'qty',
  'value',
  'asOf',
] as const;

const FLOW_FIELDS = [
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
] as const;

const RETURN_FIELDS = [
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
] as const;

const SERIES_FIELDS = [
  'scope',
  'date',
  'value',
  'netInvested',
  'sp500Equiv',
  'valueInterpolated',
  'estimated',
] as const;

export const FINANCE_FIELD_ORDER = {
  accounts: ACCOUNT_FIELDS,
  balance_snapshots: SNAPSHOT_FIELDS,
  transactions: TRANSACTION_FIELDS,
  holdings: HOLDING_FIELDS,
  flows: FLOW_FIELDS,
  returns: RETURN_FIELDS,
  series: SERIES_FIELDS,
} as const;

const MONEY_FIELDS = new Set([
  'currentBalance',
  'availableBalance',
  'balance',
  'amount',
  'qty',
  'value',
  'cumulative',
  'annualized',
  'netInvested',
  'sp500Equiv',
]);

const DATE_FIELDS = new Set(['asOf', 'date', 'coverageStart', 'startDate']);
const INTEGER_FIELDS = new Set(['syncedAt']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FinanceFields = Record<string, unknown>;

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`finance hash: non-finite money ${n}`);
  }
  if (Object.is(n, -0) || n === 0) {
    return '0.00000000';
  }
  const sign = n < 0 ? '-' : '';
  const scaled = Math.round(Math.abs(n) * 1e8);
  const whole = Math.floor(scaled / 1e8);
  const frac = String(scaled % 1e8).padStart(8, '0');
  return `${sign}${whole}.${frac}`;
}

export function formatInteger(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`finance hash: non-finite integer ${n}`);
  }
  const truncated = Math.trunc(n);
  if (truncated === 0) {
    return '0';
  }
  return String(truncated);
}

export function sanitizeHashString(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

export function assertIsoDate(value: string, field: string): string {
  if (!DATE_RE.test(value)) {
    throw new Error(`finance hash: ${field} must be YYYY-MM-DD, got ${value}`);
  }
  return value;
}

function encodeValue(field: string, raw: unknown): string {
  if (raw === undefined || raw === null) {
    return 'null';
  }
  if (MONEY_FIELDS.has(field)) {
    if (typeof raw !== 'number') {
      throw new Error(`finance hash: ${field} must be a number`);
    }
    return formatMoney(raw);
  }
  if (INTEGER_FIELDS.has(field)) {
    if (typeof raw !== 'number') {
      throw new Error(`finance hash: ${field} must be a number`);
    }
    return formatInteger(raw);
  }
  if (DATE_FIELDS.has(field)) {
    if (typeof raw !== 'string') {
      throw new Error(`finance hash: ${field} must be a YYYY-MM-DD string`);
    }
    return assertIsoDate(raw, field);
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  if (typeof raw === 'string') {
    return sanitizeHashString(raw);
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? formatInteger(raw) : formatMoney(raw);
  }
  throw new Error(`finance hash: unsupported type for ${field}`);
}

export function canonicalizeFinanceRow(
  table: FinanceTable,
  fields: FinanceFields,
): string {
  const order = FINANCE_FIELD_ORDER[table];
  const lines: string[] = [FINANCE_HASH_VERSION, table];
  for (const field of order) {
    lines.push(`${field}=${encodeValue(field, fields[field])}`);
  }
  return lines.join('\n');
}

export async function sha256Hex(canonical: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function financeContentHash(
  table: FinanceTable,
  fields: FinanceFields,
): Promise<string> {
  return sha256Hex(canonicalizeFinanceRow(table, fields));
}

/** SHA-256 of sorted content hashes joined by a single LF. No trailing LF. */
export async function bucketHash(contentHashes: string[]): Promise<string> {
  const sorted = [...contentHashes].sort();
  return sha256Hex(sorted.join('\n'));
}

export function roundMoney(n: number): number {
  return Number(formatMoney(n));
}
