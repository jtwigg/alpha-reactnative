import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Small device-local UI preferences. Native uses SecureStore because it is
 * already in the shipped binary (no new native module, OTA-safe); web uses
 * localStorage. Failures fall back to the default silently.
 */
async function readPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writePref(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Preference is best-effort.
  }
}

export function usePersistedChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (Platform.OS !== 'web') return fallback;
    try {
      const stored = globalThis.localStorage?.getItem(key);
      return stored && (options as readonly string[]).includes(stored) ? (stored as T) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void readPref(key).then((stored) => {
      if (!cancelled && stored && (options as readonly string[]).includes(stored)) setValue(stored as T);
    });
    return () => {
      cancelled = true;
    };
    // Options are a static list per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      void writePref(key, next);
    },
    [key],
  );
  return [value, update];
}

/** Boolean UI flag stored as `on` / `off`. */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [choice, setChoice] = usePersistedChoice(key, ['on', 'off'] as const, fallback ? 'on' : 'off');
  const update = useCallback((next: boolean) => setChoice(next ? 'on' : 'off'), [setChoice]);
  return [choice === 'on', update];
}
