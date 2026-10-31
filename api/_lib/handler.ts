import { createMcpHandler } from 'mcp-handler';
import { requireMcpBearer } from './bearer';
import { createConvexFinanceClient, type ConvexFinanceClient } from './convex';
import { registerFinanceTools, type FinanceToolOptions } from './tools';

export function createFinanceMcpHandler(
  convex: ConvexFinanceClient = createConvexFinanceClient(),
  options: FinanceToolOptions = {},
) {
  const mcp = createMcpHandler(
    (server) => {
      registerFinanceTools(server, convex, options);
    },
    {
      serverInfo: {
        name: 'finance',
        version: '1.0.0',
      },
      maxSubscriptions: 0,
    },
  );

  return async (request: Request): Promise<Response> => {
    const denied = requireMcpBearer(request);
    if (denied) return denied;
    return mcp(request);
  };
}
