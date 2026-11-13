import { Platform, StyleSheet, View } from 'react-native';
import { useMobileAgoraSubscribe } from '../../hooks/useMobileAgoraSubscribe';
import { loadAgoraSdk } from '../../lib/agoraEngine';

type Props = {
  roomId: string;
  accessToken?: string;
  active: boolean;
  hostPaused?: boolean;
  /** Accepted for parity with the IVS subscriber; Agora does not need them. */
  viewerBackgrounded?: boolean;
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

/** Direct Agora viewer: renders the host's remote video from the room's Agora channel. */
export function AgoraSubscriberVideo({
  roomId,
  accessToken,
  active,
  hostPaused = false,
  refreshNonce,
  subscribeEpoch,
  foregroundResumeNonce = 0,
  contentFit = 'cover',
  onConnected,
  onFailed,
  onDisconnected,
}: Props) {
  const { remoteUid } = useMobileAgoraSubscribe({
    roomId,
    accessToken,
    active,
    hostPaused,
    refreshNonce,
    subscribeEpoch,
    onConnected,
    onFailed,
    onDisconnected,
  });
  const lib = loadAgoraSdk();
  if (!active || !lib || remoteUid == null) return null;

  // Android: a texture view composites correctly under the live overlays (a surface view can punch through).
  const RemoteView = Platform.OS === 'android' ? lib.RtcTextureView : lib.RtcSurfaceView;

  return (
    <View style={styles.root} pointerEvents="none">
      <RemoteView
        // A brand-new native surface per room / host / foreground return avoids a stale black surface.
        key={`${roomId}:${remoteUid}:${subscribeEpoch ?? 0}:${foregroundResumeNonce}`}
        style={styles.video}
        canvas={{
          uid: remoteUid,
          renderMode: contentFit === 'cover' ? lib.RenderModeType.RenderModeHidden : lib.RenderModeType.RenderModeFit,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  video: { ...StyleSheet.absoluteFillObject },
});
