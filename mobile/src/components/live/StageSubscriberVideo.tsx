import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ExpoIVSRemoteStreamView } from 'expo-realtime-ivs-broadcast';
import { useMobileStageSubscribe } from '../../hooks/useMobileStageSubscribe';
import { viewerLifecycleLog } from '../../lib/viewerLifecycleLog';

type Props = {
  roomId: string;
  accessToken?: string;
  active: boolean;
  /** Host Pause / leave-app — keep Stage joined; do not rejoin on missing remote video. */
  hostPaused?: boolean;
  /**
   * When true, leaving this subscribe latches process-wide “prefer HLS / no WebRTC rejoin”.
   * Only for committed AppState background — never for feed swipe.
   */
  latchRejoinOnLeave?: boolean;
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
  hostPaused = false,
  latchRejoinOnLeave = false,
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
    hostPaused,
    latchRejoinOnLeave,
    refreshNonce,
    subscribeEpoch,
    onConnected,
    onFailed,
    onDisconnected,
  });

  const surfaceKey = remoteVideo
    ? `${roomId}:${remoteVideo.participantId}:${remoteVideo.deviceUrn}:${subscribeEpoch ?? 0}:${foregroundResumeNonce}`
    : null;

  useEffect(() => {
    if (!surfaceKey) return;
    viewerLifecycleLog('stage_subscriber_view_mounted', { roomId, surfaceKey });
  }, [surfaceKey, roomId]);

  if (!active || !remoteVideo) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <ExpoIVSRemoteStreamView
        // Force a brand-new native surface whenever the bound room/participant/device
        // changes, or when the app returns to the foreground. The Stage SDK is a
        // process-wide singleton; reusing the same view across a show→show swap — or after
        // iOS detaches the surface while inactive/backgrounded — leaves it bound to a stale
        // surface (audio plays, video stays black until the app is killed). Remounting the
        // view is the in-app equivalent of that kill.
        key={surfaceKey ?? undefined}
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
