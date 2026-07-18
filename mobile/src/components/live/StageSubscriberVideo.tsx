import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ExpoIVSRemoteStreamView } from 'expo-realtime-ivs-broadcast';
import { useMobileStageSubscribe } from '../../hooks/useMobileStageSubscribe';

/**
 * Process-wide count of distinct remote-video subscriptions we've bound a surface to.
 * The IVS Real-Time Stage SDK is a singleton: the FIRST subscribe in an app session renders
 * fine, but after a leave→rejoin (e.g. buyer backs out of a show and re-enters) the new video
 * renderer comes up bound to a stale/torn native surface — audio plays but video stays black
 * until the app is killed. We use this counter to force a one-shot fresh surface re-attach on
 * every subscribe after the first, without penalizing the (already-correct) first entry.
 */
let remoteSubscribeGeneration = 0;

/** How long after the remote video appears to force the one-shot fresh-surface re-attach. */
const SURFACE_REATTACH_DELAY_MS = 320;

type Props = {
  roomId: string;
  accessToken?: string;
  active: boolean;
  refreshNonce?: number;
  subscribeEpoch?: number;
  /** Bumps when the app returns to the foreground; forces a fresh native surface. */
  foregroundResumeNonce?: number;
  contentFit?: 'cover' | 'contain';
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected: () => void;
};

/** Native IVS Real-Time Stage subscriber view — renders the host's remote WebRTC video. */
export function StageSubscriberVideo({
  roomId,
  accessToken,
  active,
  refreshNonce,
  subscribeEpoch,
  foregroundResumeNonce = 0,
  contentFit = 'cover',
  onConnected,
  onFailed,
  onDisconnected,
}: Props) {
  const { remoteVideo } = useMobileStageSubscribe({
    roomId,
    accessToken,
    active,
    refreshNonce,
    subscribeEpoch,
    onConnected,
    onFailed,
    onDisconnected,
  });

  // One-shot fresh-surface re-attach for re-subscribes. When the buyer leaves a live show and
  // comes back, the process-wide Stage SDK re-subscribes on a stale native video surface: audio
  // returns but video stays black forever (until app kill). Bumping the view key a beat after the
  // remote video appears tears down that stale surface and re-attaches a fresh one to the live
  // renderer — the same remount trick used on app-foreground, applied to every re-entry.
  const [reattachNonce, setReattachNonce] = useState(0);
  const target = remoteVideo ? `${remoteVideo.participantId}:${remoteVideo.deviceUrn}` : null;
  const handledTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!target) {
      handledTargetRef.current = null;
      return undefined;
    }
    if (handledTargetRef.current === target) return undefined;
    handledTargetRef.current = target;
    remoteSubscribeGeneration += 1;
    // First subscribe in this app session already renders correctly — don't add a flicker there.
    if (remoteSubscribeGeneration <= 1) return undefined;
    const id = setTimeout(() => setReattachNonce((n) => n + 1), SURFACE_REATTACH_DELAY_MS);
    return () => clearTimeout(id);
  }, [target]);

  if (!active || !remoteVideo) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <ExpoIVSRemoteStreamView
        // Force a brand-new native surface whenever the bound room/participant/device
        // changes, when the app returns to the foreground, or right after a re-subscribe
        // (`reattachNonce`). The Stage SDK is a process-wide singleton; reusing the same view
        // across a show→show swap, after iOS detaches the surface while inactive/backgrounded,
        // or after a leave→rejoin leaves it bound to a stale surface (audio plays, video stays
        // black until the app is killed). Remounting the view is the in-app equivalent of that kill.
        key={`${roomId}:${remoteVideo.participantId}:${remoteVideo.deviceUrn}:${foregroundResumeNonce}:${reattachNonce}`}
        style={styles.video}
        participantId={remoteVideo.participantId}
        deviceUrn={remoteVideo.deviceUrn}
        scaleMode={contentFit === 'cover' ? 'fill' : 'fit'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
});
