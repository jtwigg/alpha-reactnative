import { type ReactNode } from 'react';

import { QueryErrorBoundary } from '@/components/query-error-boundary';

type Props = { children: ReactNode; title?: string };

/** Keeps a Finances render error from taking down the rest of the app. */
export function FinanceErrorBoundary({ children }: Props) {
  return <QueryErrorBoundary surface="finances-boundary">{children}</QueryErrorBoundary>;
}
