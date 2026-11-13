import { NativeModules, TurboModuleRegistry } from 'react-native';
import type * as AgoraSdk from 'react-native-agora';

/**
 * Lazy loader for the Agora React Native SDK.
 *
 * The SDK is a native module. A JS update (OTA) can land on an app build that was compiled without
 * it; a top-level import would then crash the whole app at startup. Requiring it on demand lets
 * those builds report "not available" and keep using the AWS publisher instead.
 */
let sdk: typeof AgoraSdk | null | undefined;

/** True only when this app binary was built with the Agora native module linked in. */
function agoraNativeModulePresent(): boolean {
  try {
    return Boolean(
      (NativeModules as Record<string, unknown>).AgoraRtcNg || TurboModuleRegistry.get('AgoraRtcNg'),
    );
  } catch {
    return false;
  }
}

export function loadAgoraSdk(): typeof AgoraSdk | null {
  if (sdk !== undefined) return sdk;
  if (!agoraNativeModulePresent()) {
    sdk = null;
    return sdk;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-agora') as typeof AgoraSdk;
  } catch {
    sdk = null;
  }
  return sdk;
}

export function isAgoraNativeAvailable(): boolean {
  return loadAgoraSdk() != null;
}

let engine: AgoraSdk.IRtcEngine | null = null;
let engineAppId: string | null = null;

/** One engine per process. Re-created only if the App ID changes. */
export function getAgoraEngine(appId: string): AgoraSdk.IRtcEngine {
  const lib = loadAgoraSdk();
  if (!lib) throw new Error('Live video backup is not available in this version of the app.');
  if (engine && engineAppId === appId) return engine;
  releaseAgoraEngine();
  const next = lib.createAgoraRtcEngine();
  const code = next.initialize({
    appId,
    channelProfile: lib.ChannelProfileType.ChannelProfileLiveBroadcasting,
  });
  if (typeof code === 'number' && code !== 0) {
    try {
      next.release();
    } catch {
      /* ignore */
    }
    throw new Error(`Could not start the live video engine (code ${code}).`);
  }
  engine = next;
  engineAppId = appId;
  return next;
}

export function releaseAgoraEngine(): void {
  if (!engine) return;
  try {
    engine.release();
  } catch {
    /* ignore */
  }
  engine = null;
  engineAppId = null;
}
