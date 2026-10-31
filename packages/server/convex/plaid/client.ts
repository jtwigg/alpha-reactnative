/**
 * Thin Plaid REST client. Credentials come from Convex env and are sent only
 * to Plaid. Errors carry Plaid's error code, never the request body, so access
 * tokens cannot reach logs or Sentry through a thrown message.
 */

const BASE_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export class PlaidError extends Error {
  constructor(
    readonly path: string,
    readonly errorCode: string | undefined,
    readonly status: number,
  ) {
    super(`Plaid ${path} failed (${status}${errorCode ? ` ${errorCode}` : ''})`);
    this.name = 'PlaidError';
  }
}

export function plaidBaseUrl(env: string | undefined): string {
  const url = BASE_URLS[(env ?? 'sandbox').trim().toLowerCase()];
  if (!url) throw new Error('PLAID_ENV must be "sandbox" or "production"');
  return url;
}

export async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error('PLAID_CLIENT_ID / PLAID_SECRET are not set');
  const res = await fetch(`${plaidBaseUrl(process.env.PLAID_ENV)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { error_code?: string } & Record<string, unknown>;
  if (!res.ok) throw new PlaidError(path, json.error_code, res.status);
  return json as T;
}
