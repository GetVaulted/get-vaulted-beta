import { initializeStage, setStageAudioPreset } from 'expo-realtime-ivs-broadcast';
import { runIvsStageSerialized } from './ivsStageGate';

export type StageAudioUseCase = 'studio' | 'subscribeOnly' | 'videoChat';

// Memoized in-flight/completed promise instead of a boolean. useMobileStagePublish and
// useMobileStageSubscribe both call ensureStageSdkInitialized, and can do so around the same
// time - a host publishing while also subscribed to another participant's stream, or the
// subscribe path's own Promise.all([ensureStageSdkInitialized(...), resolveViewerStageToken(...)]).
// A plain boolean check-then-set is not atomic across the await inside initializeStage(), so two
// concurrent callers could each see "not yet initialized" and both invoke the native init at
// once. That double-init is a likely trigger for the native SIGABRT seen in production inside
// libbroadcastcore.so's createVideoEncoderFactory() (Play Console, release 1.0.11, ~18.9% of
// crashes) - encoder/platform setup running twice concurrently on the same process-wide stage.
// Routing the real init through runIvsStageSerialized also stops it from ever overlapping a
// real join/leave, which was the original race ivsStageGate.ts was built to prevent.
let stageSdkInitPromise: Promise<void> | null = null;

/**
 * Idempotent IVS Real-Time SDK bootstrap.
 * Always applies the audio preset first — hosts use `studio`, viewers use `subscribeOnly`
 * so playback uses media volume (not call volume from the default `videoChat` preset).
 */
export async function ensureStageSdkInitialized(
  audioPreset: StageAudioUseCase = 'studio',
): Promise<void> {
  try {
    await setStageAudioPreset(audioPreset);
  } catch {
    /* Preset may already be locked after DeviceDiscovery/Stage — best-effort. */
  }
  if (!stageSdkInitPromise) {
    stageSdkInitPromise = runIvsStageSerialized(() => initializeStage()).catch((err) => {
      // A genuinely failed init should be retryable by a later caller, not wedge forever.
      stageSdkInitPromise = null;
      throw err;
    });
  }
  await stageSdkInitPromise;
}
