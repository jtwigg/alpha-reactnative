import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ScrollLock = (owner: string, locked: boolean) => void;

const ScrollLockContext = createContext<ScrollLock>(() => undefined);

/**
 * Lets a chart freeze the page ScrollView while it owns a gesture (scrub,
 * two-finger compare, handle drag), so the page does not drift or trigger
 * pull-to-refresh mid-gesture. Wrap the screen and pass `scrollEnabled`.
 */
export function useScrollLockRoot(): {
  scrollEnabled: boolean;
  ScrollLockProvider: (props: { children: ReactNode }) => ReactNode;
} {
  const owners = useRef(new Set<string>());
  const [locked, setLocked] = useState(false);
  const lock = useCallback<ScrollLock>((owner, value) => {
    if (value) owners.current.add(owner);
    else owners.current.delete(owner);
    setLocked(owners.current.size > 0);
  }, []);
  const ScrollLockProvider = useMemo(
    () =>
      function Provider({ children }: { children: ReactNode }) {
        return <ScrollLockContext.Provider value={lock}>{children}</ScrollLockContext.Provider>;
      },
    [lock],
  );
  return { scrollEnabled: !locked, ScrollLockProvider };
}

export function useScrollLock(): ScrollLock {
  return useContext(ScrollLockContext);
}
