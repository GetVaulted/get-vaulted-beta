import { leaveStage, setStageAudioOutputEnabled } from 'expo-realtime-ivs-broadcast';
import { leaveStageSerialized } from './ivsStageGate';
import { markBuyerStageLeft } from './buyerStageJoinState';
import { setLiveFeedKeepAlive } from './liveFeedKeepAlive';
import { viewerLifecycleLog } from './viewerLifecycleLog';

/**
 * Fully stop the kept-alive buyer feed (mini X, or opening a different show).
 * Clears keep-alive, mutes Stage audio, and leaveStages the process singleton.
 */
export async function tearDownKeptAliveLiveFeed(reason: string, roomId?: string): Promise<void> {
  setLiveFeedKeepAlive(null);
  viewerLifecycleLog('stage_teardown', {
    reason,
    latchRejoin: false,
    roomId: roomId ?? null,
  });
  try {
    await setStageAudioOutputEnabled(false);
  } catch {
    /* ignore */
  }
  await leaveStageSerialized(() => leaveStage());
  markBuyerStageLeft(roomId);
  viewerLifecycleLog('cleanup_completed', { reason });
}
