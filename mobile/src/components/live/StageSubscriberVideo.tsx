import { StyleSheet, View } from 'react-native';
import { ExpoIVSRemoteStreamView } from 'expo-realtime-ivs-broadcast';
import { useMobileStageSubscribe } from '../../hooks/useMobileStageSubscribe';

type Props = {
  roomId: string;
  accessToken?: string;
  active: boolean;
  refreshNonce?: number;
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
    onConnected,
    onFailed,
    onDisconnected,
  });

  if (!active || !remoteVideo) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <ExpoIVSRemoteStreamView
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
