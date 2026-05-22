import { clearHomeFeedCache } from './homeFeedCache';

/** Bust `gv_home_feed_v1` live/scheduled snapshot so Home + Live tabs refetch. */
export async function notifyLiveDiscoveryChanged(): Promise<void> {
  await clearHomeFeedCache();
}
