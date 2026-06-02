import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { subscribeHomeFeedInvalidation } from '../lib/homeFeedCache';
import { shouldThrottleLiveDiscoveryFetch } from '../lib/liveDiscoveryFetchPolicy';
import { LIVE_DISCOVERY_CHANNEL, LIVE_DISCOVERY_EVENT } from '../lib/liveDiscoveryRealtime';
import { getSupabase } from '../lib/supabase';

const DISCOVERY_POLL_MS = 45_000;

export type LiveDiscoveryRefreshOptions = {
  /** Bypass throttle (pull-to-refresh, manual bust). */
  force?: boolean;
  hadCache?: boolean;
  bustCache?: boolean;
};

/**
 * Refetch live discovery on tab focus, periodic poll, cache invalidation, and Supabase broadcast.
 * Failed fetches are throttled so the Live tab does not hammer the API or flicker.
 */
export function useLiveDiscoverySync(
  onRefresh: (opts?: LiveDiscoveryRefreshOptions) => void | Promise<void>,
): void {
  const tick = useCallback(
    (opts?: LiveDiscoveryRefreshOptions) => {
      const force = Boolean(opts?.force || opts?.bustCache);
      if (shouldThrottleLiveDiscoveryFetch({ force })) return;
      void onRefresh(opts);
    },
    [onRefresh],
  );

  useFocusEffect(
    useCallback(() => {
      tick({ hadCache: true });
      const id = setInterval(() => tick({ hadCache: true }), DISCOVERY_POLL_MS);
      return () => clearInterval(id);
    }, [tick]),
  );

  useEffect(
    () =>
      subscribeHomeFeedInvalidation((opts) =>
        tick({ hadCache: true, force: Boolean(opts?.force) }),
      ),
    [tick],
  );

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel(LIVE_DISCOVERY_CHANNEL)
      .on('broadcast', { event: LIVE_DISCOVERY_EVENT }, () => tick({ hadCache: true, force: true }))
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [tick]);
}
