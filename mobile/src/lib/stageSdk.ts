import { initializeStage } from 'expo-realtime-ivs-broadcast';

let stageSdkInitialized = false;

/** Idempotent IVS Real-Time SDK bootstrap shared by host publish and buyer subscribe hooks. */
export async function ensureStageSdkInitialized(): Promise<void> {
  if (stageSdkInitialized) return;
  await initializeStage();
  stageSdkInitialized = true;
}
