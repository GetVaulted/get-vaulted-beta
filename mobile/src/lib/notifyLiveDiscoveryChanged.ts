import { clearHomeFeedCache } from './homeFeedCache';

/**
 * Bust cached live/scheduled snapshots and force Home + Live tabs to refetch immediately
 * (bypasses the 12s discovery throttle). Server also emits Supabase `gv-live-discovery`
 * after successful PATCH/POST — this covers same-app refresh without waiting for broadcast.
 */
export async function notifyLiveDiscoveryChanged(): Promise<void> {
  await clearHomeFeedCache({ force: true });
}
