import { leaveStage, setStageAudioOutputEnabled } from 'expo-realtime-ivs-broadcast';
import { leaveStageSerialized } from './ivsStageGate';
import { viewerLifecycleLog } from './viewerLifecycleLog';

/**
 * Tear down the process-wide buyer Stage subscribe and mute output.
 * Used when the mini player X is pressed — React unmount alone can race and leave audio.
 */
export async function teardownBuyerStageSession(reason: string, roomId?: string): Promise<void> {
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
  viewerLifecycleLog('cleanup_completed', { reason });
}
