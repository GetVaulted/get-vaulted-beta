import { VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';
import { useHlsLiveEdgeSeek } from '../hooks/useHlsLiveEdgeSeek';
import { useLiveMiniPlayer } from './LiveMiniPlayerContext';

/**
 * Tiny root HLS surface for the shared player while a live room is open.
 * Keeps the native decoder attached without covering the UI.
 * In-room home-swipe PiP is owned by LiveStagePlayback (Stage remote or front HLS).
 * This view must NOT start PiP — competing owners crash / freeze the home transition.
 */
export function LivePersistentHlsCompanion() {
  const { session, player, playbackSourceUrl } = useLiveMiniPlayer();

  // Only mount while warming in-room (mini overlay owns the VideoView after Back).
  const active = Boolean(playbackSourceUrl) && !session;
  useHlsLiveEdgeSeek(player, active);

  if (!active || !playbackSourceUrl) return null;

  return (
    <View pointerEvents="none" style={styles.host} collapsable={false}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        startsPictureInPictureAutomatically={false}
        collapsable={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: -160,
    top: 0,
    width: 132,
    height: 220,
    opacity: 0.08,
    zIndex: 0,
    overflow: 'hidden',
  },
  video: {
    width: 132,
    height: 220,
  },
});
