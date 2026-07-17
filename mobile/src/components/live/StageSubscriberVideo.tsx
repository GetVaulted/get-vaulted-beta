import { StyleSheet, View } from 'react-native';
import { ExpoIVSRemoteStreamView } from 'expo-realtime-ivs-broadcast';
import { useMobileStageSubscribe } from '../../hooks/useMobileStageSubscribe';

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
        key={`${roomId}:${remoteVideo.participantId}:${remoteVideo.deviceUrn}:${foregroundResumeNonce}`}
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
