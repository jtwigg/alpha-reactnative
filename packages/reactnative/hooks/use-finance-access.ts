import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';

export type FinanceAccess = 'loading' | 'allowed' | 'denied' | 'signed-out' | 'demo';

/** Waits for Convex auth before asking the server allowlist. */
export function useFinanceAccess(demo: boolean): FinanceAccess {
  const clerk = isClerkConfigured();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const allowed = useQuery(api.finance.queries.isAllowed, clerk && isAuthenticated ? {} : 'skip');
  if (!clerk) return demo ? 'demo' : 'denied';
  if (isLoading) return 'loading';
  if (!isAuthenticated) return demo ? 'demo' : 'signed-out';
  if (allowed === undefined) return 'loading';
  if (!allowed) return demo ? 'demo' : 'denied';
  return 'allowed';
}
