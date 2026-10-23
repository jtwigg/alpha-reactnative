/**
 * Constant-time compare for FINANCE_SERVER_SECRET / FINANCE_MCP_TOKEN.
 * Works in Convex's V8 isolate (no node:crypto) and in Node.
 */
export function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const len = Math.max(a.length, b.length, 1);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function bearerMatches(
  header: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const token = bearerToken(header);
  if (!token) return false;
  return timingSafeEqualString(token, expected);
}
