export type QueryMode = 'throw' | 'loading' | 'empty';

export const convexQuery: { mode: QueryMode } = { mode: 'throw' };

export function setQueryMode(mode: QueryMode) {
  convexQuery.mode = mode;
}

export const routeParams: { current: Record<string, string | undefined> } = {
  current: { accountId: 'acc_brokerage' },
};

export function resolveQuery(args: unknown): unknown {
  if (args === 'skip') return undefined;
  if (convexQuery.mode === 'throw') {
    throw new Error('Convex backend unavailable');
  }
  if (convexQuery.mode === 'loading') return undefined;
  return null;
}

export function resolvePaginated(): {
  results: unknown[];
  status: string;
  loadMore: () => void;
} {
  if (convexQuery.mode === 'throw') {
    throw new Error('Convex backend unavailable');
  }
  return {
    results: [],
    status: convexQuery.mode === 'loading' ? 'LoadingFirstPage' : 'Exhausted',
    loadMore: () => undefined,
  };
}
