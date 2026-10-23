import { bearerMatches } from '../../packages/server/convex/finance/secret';

export { bearerMatches, bearerToken, timingSafeEqualString } from '../../packages/server/convex/finance/secret';

export function requireMcpBearer(request: Request): Response | null {
  const expected = process.env.FINANCE_MCP_TOKEN;
  if (!bearerMatches(request.headers.get('authorization'), expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
