import { describe, it, expect, beforeAll } from 'vitest';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

describe('finance reads (e2e)', () => {
  let client: ConvexHttpClient;

  beforeAll(() => {
    const url = process.env.CONVEX_URL ?? 'http://127.0.0.1:3210';
    client = new ConvexHttpClient(url);
  });

  it('isAllowed is false when signed out', async () => {
    expect(await client.query(api.finance.queries.isAllowed)).toBe(false);
  });

  it('rejects unauthenticated accounts', async () => {
    await expect(client.query(api.finance.queries.accounts)).rejects.toThrow();
  });

  it('rejects unauthenticated snapshots', async () => {
    await expect(client.query(api.finance.queries.snapshots, {})).rejects.toThrow();
  });

  it('rejects unauthenticated netWorth', async () => {
    await expect(client.query(api.finance.queries.netWorth)).rejects.toThrow();
  });

  it('rejects unauthenticated page', async () => {
    await expect(client.query(api.finance.queries.page, {})).rejects.toThrow();
  });
});
