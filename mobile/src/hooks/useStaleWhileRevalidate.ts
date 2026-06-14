import { useCallback, useRef, useState } from 'react';

type RunOpts = {
  /** Keep existing UI visible while refetching (focus, poll, pull-to-refresh). */
  silent?: boolean;
};

/**
 * Stale-while-revalidate loader: blocking spinner only on the first load.
 * Subsequent refetches set `refreshing` without hiding existing content.
 */
export function useStaleWhileRevalidate<T>(run: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const reload = useCallback(
    async (opts?: RunOpts) => {
      const requestId = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        setError(null);
        const next = await run();
        if (requestId !== requestRef.current) return next;
        setData(next);
        return next;
      } catch (e) {
        if (requestId !== requestRef.current) return null;
        if (!loadedOnceRef.current) setData(null);
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        return null;
      } finally {
        if (requestId !== requestRef.current) return;
        loadedOnceRef.current = true;
        setLoadedOnce(true);
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [run],
  );

  return {
    data,
    setData,
    loading,
    refreshing,
    loadedOnce,
    error,
    setError,
    reload,
    showBlockingLoader: loading && !loadedOnceRef.current,
  };
}
