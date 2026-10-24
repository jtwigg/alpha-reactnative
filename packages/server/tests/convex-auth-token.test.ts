import { describe, expect, it, vi } from 'vitest';
import {
  decodeJwtClaims,
  describeConvexAuthStuck,
  getConvexAccessToken,
  withTimeout,
} from '../../reactnative/lib/convex';

function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

const ISS = 'https://example-issuer.clerk.accounts.dev';
const convexToken = fakeJwt({ aud: 'convex', iss: ISS, sub: 'user_test', name: 'Café' });

describe('decodeJwtClaims', () => {
  it('decodes base64url payloads including non-ASCII', () => {
    expect(decodeJwtClaims(convexToken)).toMatchObject({ aud: 'convex', iss: ISS, name: 'Café' });
  });

  it('returns null for malformed tokens', () => {
    expect(decodeJwtClaims('not-a-jwt')).toBeNull();
    expect(decodeJwtClaims('a.%%%.c')).toBeNull();
  });
});

describe('getConvexAccessToken', () => {
  it('uses the default session token when claims already show aud=convex', async () => {
    const getToken = vi.fn(async () => convexToken);
    await expect(getConvexAccessToken(getToken, { aud: 'convex' })).resolves.toBe(convexToken);
    expect(getToken).toHaveBeenCalledWith(undefined);
  });

  it('forwards skipCache for forced refreshes', async () => {
    const getToken = vi.fn(async () => convexToken);
    await getConvexAccessToken(getToken, { aud: 'convex' }, { skipCache: true });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it('does not ask for the missing `convex` template when claims are stale after an in-app sign-in', async () => {
    const getToken = vi.fn(async (options?: { template?: string }) => {
      if (options?.template) throw new Error('No JWT template exists with name: convex');
      return convexToken;
    });
    await expect(getConvexAccessToken(getToken, null)).resolves.toBe(convexToken);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken.mock.calls.some(([options]) => options?.template)).toBe(false);
  });

  it('falls back to the legacy template when the session token lacks aud=convex', async () => {
    const legacy = fakeJwt({ aud: 'convex', iss: ISS });
    const getToken = vi.fn(async (options?: { template?: string; skipCache?: boolean }) =>
      options?.template === 'convex' ? legacy : fakeJwt({ iss: ISS }),
    );
    await expect(getConvexAccessToken(getToken, undefined, { skipCache: true })).resolves.toBe(legacy);
    expect(getToken).toHaveBeenLastCalledWith({ template: 'convex', skipCache: true });
  });
});

describe('withTimeout', () => {
  it('resolves with the fallback when the promise hangs', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<string | null>(() => undefined), 15_000, null);
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes through a settled value', async () => {
    await expect(withTimeout(Promise.resolve('token'), 1_000, null)).resolves.toBe('token');
  });
});

describe('describeConvexAuthStuck', () => {
  it('distinguishes a rejected session from one still loading', () => {
    const claims = { aud: 'convex', iss: 'https://awaited-jennet-2760.clerk.accounts.dev' };
    expect(describeConvexAuthStuck(claims, 'rejected').reason).toMatch(/not authenticated/);
    expect(describeConvexAuthStuck(claims).reason).toMatch(/still isLoading/);
  });
});
