import { initializeStage, setStageAudioPreset } from 'expo-realtime-ivs-broadcast';

export type StageAudioUseCase = 'studio' | 'subscribeOnly' | 'videoChat';

let stageSdkInitialized = false;

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
  if (stageSdkInitialized) return;
  await initializeStage();
  stageSdkInitialized = true;
}
