export const FLOW_KINDS = ['internal_transfer', 'roth_conversion', 'external'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

export const TWR_WINDOWS = ['3M', '6M', 'YTD', '1Y', '3Y', 'SI'] as const;
export type TwrWindow = (typeof TWR_WINDOWS)[number];

export const TWR_METHOD = 'finance.twr.v1' as const;

export const TWR_SCOPES = ['total', 'reliable_subset'] as const;
export type TwrScopeKind = (typeof TWR_SCOPES)[number] | `account:${string}`;

export function isFlowKind(value: string): value is FlowKind {
  return (FLOW_KINDS as readonly string[]).includes(value);
}

export function isTwrWindow(value: string): value is TwrWindow {
  return (TWR_WINDOWS as readonly string[]).includes(value);
}

export function isTwrMethod(value: string): value is typeof TWR_METHOD {
  return value === TWR_METHOD;
}

export function accountScope(accountId: string): `account:${string}` {
  return `account:${accountId}`;
}

export function parseAccountScope(scope: string): string | null {
  return scope.startsWith('account:') && scope.length > 8 ? scope.slice(8) : null;
}

export function parseSp500ReturnScope(scope: string): string | null {
  return scope.startsWith('sp500:') && scope.length > 6 ? scope.slice(6) : null;
}

/** `total`, `reliable_subset`, or `account:<id>` — not a nested `sp500:` prefix. */
export function isPlainReturnScope(scope: string): boolean {
  return scope === 'total' || scope === 'reliable_subset' || Boolean(parseAccountScope(scope));
}

/**
 * Stored TWR row scopes, including Finance-computed S&P TWR at `sp500:<inner>`
 * (`sp500:total`, `sp500:reliable_subset`, `sp500:account:<id>`).
 */
export function isReturnScope(scope: string): boolean {
  if (isPlainReturnScope(scope)) return true;
  const inner = parseSp500ReturnScope(scope);
  return inner != null && isPlainReturnScope(inner);
}

export const RETURN_SCOPE_MESSAGE =
  "returns.scope must be total, reliable_subset, account:<id>, or sp500:<those> (sp500:total, sp500:reliable_subset, sp500:account:<id>)";

export function assertReturnScope(scope: string): void {
  if (isReturnScope(scope)) return;
  throw new Error(`${RETURN_SCOPE_MESSAGE}, got ${scope}`);
}

export function assertReturnWindow(window: string): asserts window is TwrWindow {
  if (!isTwrWindow(window)) throw new Error(`returns.window must be one of ${TWR_WINDOWS.join('|')}`);
}

export function assertReturnMethod(method: string): void {
  if (!isTwrMethod(method)) throw new Error(`returns.method must be ${TWR_METHOD}`);
}

export function assertFlowKind(kind: string): asserts kind is FlowKind {
  if (!isFlowKind(kind)) throw new Error(`flows.kind must be one of ${FLOW_KINDS.join('|')}`);
}

/** Last item for each scope+window wins when a batch repeats a key. */
export function dedupeReturnsByKey<T extends { scope: string; window: string }>(items: T[]): T[] {
  const last = new Map<string, T>();
  for (const item of items) last.set(`${item.scope}|${item.window}`, item);
  return [...last.values()];
}

export function groupByAsOf<T extends { asOf: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.asOf) ?? [];
    list.push(item);
    groups.set(item.asOf, list);
  }
  return groups;
}

export const TWR_WINDOW_LABELS: Record<TwrWindow, string> = {
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'year to date',
  '1Y': '1 year',
  '3Y': '3 years',
  SI: 'since inception',
};
