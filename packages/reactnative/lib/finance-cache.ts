import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Memory + disk cache for ready-to-serve finance packs.
 * Web uses localStorage. Native keeps an in-memory map (SecureStore is too
 * small for chart payloads; no new native module for OTA).
 */
const memory = new Map<string, string>();

function diskGet(key: string): string | null {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    /* ignore */
  }
  return null;
}

function diskSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function cacheGet<T>(key: string): T | null {
  const raw = memory.get(key) ?? diskGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    diskSet(key, raw);
  } catch {
    /* ignore */
  }
}

/** Show cached data immediately, then follow the live Convex value. */
export function useCachedValue<T>(key: string, live: T | undefined): T | undefined {
  const [cached, setCached] = useState<T | undefined>(() => cacheGet<T>(key) ?? undefined);
  useEffect(() => {
    if (live === undefined) return;
    cacheSet(key, live);
    setCached(live);
  }, [key, live]);
  return live ?? cached;
}
