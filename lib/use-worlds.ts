'use client';

import { useCallback, useEffect, useState } from 'react';

import type { World } from './k8s';

/**
 * Shared `useWorlds` hook with a localStorage-backed cache so the dashboard,
 * analytics, and any future page can share the same fetched data without
 * re-hitting the EKS API on every navigation.
 *
 * Behaviour:
 *   - First mount on any page: read cache. If fresh (< TTL), use it (no fetch).
 *   - If absent or stale: fetch from /api/worlds and write to cache.
 *   - `refresh()`: bypasses cache, fetches fresh, updates cache.
 *   - `refreshTrigger` prop: bump from parent (e.g. after create/delete) to
 *     trigger an immediate refresh that writes the new data to cache.
 */

const CACHE_KEY = 'khepri:worlds:cache:v1';
const TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CachedWorlds {
  worlds: World[];
  cachedAt: number;
}

function readCache(): CachedWorlds | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWorlds;
    if (
      typeof parsed.cachedAt !== 'number' ||
      !Array.isArray(parsed.worlds) ||
      Date.now() - parsed.cachedAt > TTL_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(worlds: World[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ worlds, cachedAt: Date.now() } satisfies CachedWorlds),
    );
  } catch {
    // Quota / disabled — silent: the next fetch will just bypass cache.
  }
}

export function clearWorldsCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export interface UseWorldsResult {
  worlds: World[] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  cachedAt: number | null;
  refresh: () => Promise<void>;
}

export function useWorlds(refreshTrigger?: number): UseWorldsResult {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAndStore = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/worlds');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === 'BACKEND_UNREACHABLE') {
          throw new Error(
            'Backend unreachable. If you are running locally, make sure the VPN is connected and try again.',
          );
        }
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list: World[] = data.worlds ?? [];
      setWorlds(list);
      const now = Date.now();
      setCachedAt(now);
      writeCache(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worlds');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  // First mount: hydrate from cache if fresh; otherwise fetch.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setWorlds(cached.worlds);
      setCachedAt(cached.cachedAt);
      setLoading(false);
    } else {
      void fetchAndStore(false);
    }
  }, [fetchAndStore]);

  // Parent-triggered refresh (e.g. after create/delete).
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    void fetchAndStore(true);
  }, [refreshTrigger, fetchAndStore]);

  return {
    worlds,
    loading,
    refreshing,
    error,
    cachedAt,
    refresh: () => fetchAndStore(true),
  };
}
