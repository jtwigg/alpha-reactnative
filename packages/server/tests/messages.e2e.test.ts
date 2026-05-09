import { describe, it, expect, beforeAll } from 'vitest';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

describe('messages (e2e)', () => {
  let client: ConvexHttpClient;

  beforeAll(() => {
    const url = process.env.CONVEX_URL ?? 'http://127.0.0.1:3210';
    client = new ConvexHttpClient(url);
  });

  it('lists messages', async () => {
    const messages = await client.query(api.messages.list);
    expect(Array.isArray(messages)).toBe(true);
  });

  it('sends a message and finds it in the list', async () => {
    const uniqueText = `e2e-${Date.now()}`;
    await client.mutation(api.messages.send, { text: uniqueText, author: 'e2e' });
    const messages = await client.query(api.messages.list);
    const found = messages.find((m) => m.text === uniqueText);
    expect(found).toBeDefined();
    expect(found?.author).toBe('e2e');
  });

  it('getHello returns a non-empty string', async () => {
    const result = await client.query(api.messages.getHello);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('seed is idempotent', async () => {
    await client.mutation(api.messages.seed);
    await client.mutation(api.messages.seed);
    const messages = await client.query(api.messages.list);
    const seeds = messages.filter((m) => m.text === 'Hello, World!' && m.author === 'system');
    expect(seeds.length).toBeLessThanOrEqual(1);
  });
});
