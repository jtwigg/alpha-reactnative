import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import type { Id } from '../../server/convex/_generated/dataModel';

export function useStoreUser() {
  const clerkEnabled = isClerkConfigured();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [userId, setUserId] = useState<Id<'users'> | null>(null);
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!clerkEnabled || !isAuthenticated) {
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
  }, [clerkEnabled, isAuthenticated, storeUser]);

  return {
    isLoading: clerkEnabled && (isLoading || (isAuthenticated && userId === null)),
    isAuthenticated: Boolean(isAuthenticated && userId),
  };
}
