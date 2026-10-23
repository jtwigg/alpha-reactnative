import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import type { Id } from '../../server/convex/_generated/dataModel';

export function useStoreUser() {
  const clerkEnabled = isClerkConfigured();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const status = useQuery(api.access.status, clerkEnabled && isAuthenticated ? {} : 'skip');
  const [userId, setUserId] = useState<Id<'users'> | null>(null);
  const storeUser = useMutation(api.users.store);
  const allowed = Boolean(status?.allowed);

  useEffect(() => {
    if (!clerkEnabled || !isAuthenticated || !allowed) {
      setUserId(null);
      return;
    }

    let cancelled = false;
    storeUser()
      .then((id) => {
        if (!cancelled) setUserId(id);
      })
      .catch((error) => {
        console.error('Failed to store user in Convex', error);
      });

    return () => {
      cancelled = true;
    };
  }, [allowed, clerkEnabled, isAuthenticated, storeUser]);

  return {
    isLoading:
      clerkEnabled &&
      (isLoading ||
        (isAuthenticated && status === undefined) ||
        (allowed && userId === null)),
    isAuthenticated: Boolean(isAuthenticated && allowed && userId),
    isDenied: Boolean(isAuthenticated && status && !status.allowed),
  };
}
