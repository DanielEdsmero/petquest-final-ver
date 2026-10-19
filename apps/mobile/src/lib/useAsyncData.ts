import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A small loading/error/refetch wrapper for Supabase reads.
 *
 * Deliberately not @tanstack/react-query: the app makes a handful of simple,
 * user-scoped reads, and this is ~60 lines with no dependency. If the data
 * layer grows past that — cross-screen cache sharing, optimistic writes,
 * pagination — react-query becomes the right answer and this can be swapped out
 * behind the same hook shape.
 *
 * What it does handle, because a tabbed mobile app needs it:
 *   • refetch when the screen regains focus, so switching tabs shows fresh data
 *   • drop a response that arrives after the component unmounted
 *   • drop a stale response when a newer request has already been issued
 *   • separate `loading` (first load, show a spinner) from `refreshing`
 *     (pull-to-refresh, keep the old data on screen)
 */

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Replace the local copy without a round trip (after a successful write). */
  setData: (next: T | null) => void;
};

export function useAsyncData<T>(
  fetcher: () => Promise<{ data: T | null; error: string | null }>,
  options: { enabled?: boolean; refetchOnFocus?: boolean } = {},
): AsyncState<T> {
  const { enabled = true, refetchOnFocus = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  /** Incremented per request; only the newest is allowed to write state. */
  const requestId = useRef(0);
  // Held in a ref so an inline fetcher does not restart the effect every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      if (!enabled) return;
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);

      const result = await fetcherRef.current().catch((e: unknown) => ({
        data: null,
        error: e instanceof Error ? e.message : 'Something went wrong.',
      }));

      if (!mounted.current || id !== requestId.current) return;

      setError(result.error);
      // Keep whatever is on screen if the refresh failed — blanking the list
      // because a pull-to-refresh timed out is worse than stale data.
      if (!result.error) setData(result.data);
      setLoading(false);
      setRefreshing(false);
    },
    [enabled],
  );

  const refetch = useCallback(() => run('load'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);

  useEffect(() => {
    if (enabled) void run('load');
    else setLoading(false);
  }, [enabled, run]);

  useFocusEffect(
    useCallback(() => {
      // Skip the very first focus: the mount effect above already loaded.
      if (refetchOnFocus && enabled && requestId.current > 0) void run('refresh');
    }, [refetchOnFocus, enabled, run]),
  );

  return { data, loading, refreshing, error, refetch, refresh, setData };
}
