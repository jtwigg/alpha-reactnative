import { describe, expect, it, vi } from 'vitest';
import { bearerMatches, timingSafeEqualString } from '../convex/finance/secret';
import { dispatchFinanceOp } from '../convex/finance/gateway';
import { createFinanceMcpHandler } from '../../../api/_lib/handler';
import { convexSiteUrl } from '../../../api/_lib/convex';

describe('timing-safe bearer compare', () => {
  it('accepts an exact Bearer token', () => {
    expect(bearerMatches('Bearer secret-token', 'secret-token')).toBe(true);
    expect(bearerMatches('bearer secret-token', 'secret-token')).toBe(true);
  });

  it('rejects missing, empty, or wrong tokens', () => {
    expect(bearerMatches(null, 'secret-token')).toBe(false);
    expect(bearerMatches('Bearer secret-token', undefined)).toBe(false);
    expect(bearerMatches('Bearer secret-token', '')).toBe(false);
    expect(bearerMatches('Bearer other', 'secret-token')).toBe(false);
    expect(bearerMatches('secret-token', 'secret-token')).toBe(false);
    expect(timingSafeEqualString('aa', 'ab')).toBe(false);
  });
});

describe('convex site URL', () => {
  it('prefers CONVEX_SITE_URL then derives from the cloud URL', () => {
    expect(convexSiteUrl({ CONVEX_SITE_URL: 'https://posh-mink-581.convex.site/' })).toBe(
      'https://posh-mink-581.convex.site',
    );
    expect(
      convexSiteUrl({ EXPO_PUBLIC_CONVEX_URL: 'https://posh-mink-581.convex.cloud' }),
    ).toBe('https://posh-mink-581.convex.site');
  });
});

describe('dispatchFinanceOp', () => {
  it('routes upsert_accounts to the ingest mutation', async () => {
    const runMutation = vi.fn(async () => ({ inserted: 1 }));
    const runQuery = vi.fn();
    await dispatchFinanceOp(
      { runMutation, runQuery },
      'upsert_accounts',
      { items: [{ sourceId: 'acc_1' }] },
    );
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('rejects unknown ops', async () => {
    await expect(
      dispatchFinanceOp({ runMutation: vi.fn(), runQuery: vi.fn() }, 'nope', {}),
    ).rejects.toThrow(/Unknown finance op/);
  });
});

describe('MCP handler', () => {
  it('returns 401 without a matching bearer token', async () => {
    const previous = process.env.FINANCE_MCP_TOKEN;
    process.env.FINANCE_MCP_TOKEN = 'test-mcp-token';
    try {
      const handler = createFinanceMcpHandler({
        call: async () => {
          throw new Error('should not call Convex');
        },
      });
      const response = await handler(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
      expect(response.status).toBe(401);
    } finally {
      process.env.FINANCE_MCP_TOKEN = previous;
    }
  });

  it('lists finance tools after initialize', async () => {
    const previous = process.env.FINANCE_MCP_TOKEN;
    process.env.FINANCE_MCP_TOKEN = 'test-mcp-token';
    try {
      const handler = createFinanceMcpHandler({
        call: async (op) => ({ op, ok: true }),
      });
      const headers = {
        Authorization: 'Bearer test-mcp-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };
      const init = await handler(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-11-25',
              capabilities: {},
              clientInfo: { name: 'finance-mcp-test', version: '0.0.1' },
            },
          }),
        }),
      );
      expect(init.status).toBeLessThan(400);
      await init.text();

      const listed = await handler(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        }),
      );
      const raw = await listed.text();
      expect(listed.status).toBeLessThan(400);
      expect(raw).toContain('upsert_accounts');
      expect(raw).toContain('upsert_snapshots');
      expect(raw).toContain('upsert_transactions');
      expect(raw).toContain('upsert_holdings');
      expect(raw).toContain('fill_gaps');
      expect(raw).toContain('get_digest');
      expect(raw).toContain('export_bucket');
      expect(raw).toContain('list_accounts');

      const called = await handler(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'list_accounts', arguments: {} },
          }),
        }),
      );
      const callBody = await called.text();
      expect(called.status).toBeLessThan(400);
      expect(callBody).toContain('list_accounts');
    } finally {
      process.env.FINANCE_MCP_TOKEN = previous;
    }
  });
});
