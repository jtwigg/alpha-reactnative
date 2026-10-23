import { describe, it, expect, beforeAll } from 'vitest';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

describe('messages (e2e)', () => {
  let client: ConvexHttpClient;

  beforeAll(() => {
    const url = process.env.CONVEX_URL ?? 'http://127.0.0.1:3210';
    client = new ConvexHttpClient(url);
  });

  it('rejects unauthenticated list', async () => {
    await expect(client.query(api.messages.list)).rejects.toThrow();
  });

  it('rejects unauthenticated send', async () => {
    await expect(
      client.mutation(api.messages.send, { text: `e2e-${Date.now()}` }),
    ).rejects.toThrow();
  });

  it('rejects unauthenticated users.current as null or throw', async () => {
    const result = await client.query(api.users.current);
    expect(result).toBeNull();
  });

  it('rejects unauthenticated greeting', async () => {
    await expect(client.query(api.users.greeting)).rejects.toThrow();
  });

  it('access.status is denied when signed out', async () => {
    expect(await client.query(api.access.status)).toMatchObject({
      authenticated: false,
      allowed: false,
    });
  });
});
