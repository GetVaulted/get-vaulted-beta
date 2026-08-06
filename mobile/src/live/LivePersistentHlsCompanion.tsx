import { useEffect, useState } from 'react';
import { VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';
import { useHlsLiveEdgeSeek } from '../hooks/useHlsLiveEdgeSeek';
import { useLiveMiniPlayer } from './LiveMiniPlayerContext';

/**
 * Tiny root HLS surface for the shared player while a live room is open.
 * Keeps the native decoder attached without covering the UI.
 * In-room home-swipe PiP is owned by LiveStagePlayback (Stage remote or front HLS).
 * This view must NOT start PiP — competing owners crash / freeze the home transition.
 *
 * On Back→mini, keep this surface attached briefly so the decoder never goes
 * attached→none→attached while the overlay VideoView mounts.
 */
export function LivePersistentHlsCompanion() {
  const { session, player, playbackSourceUrl } = useLiveMiniPlayer();
  const [keepDuringMiniHandoff, setKeepDuringMiniHandoff] = useState(false);

  useEffect(() => {
    if (!session) {
      setKeepDuringMiniHandoff(false);
      return;
    }
    // Mini overlay owns the visible VideoView — hold the companion for one beat first.
    setKeepDuringMiniHandoff(true);
    const t = setTimeout(() => setKeepDuringMiniHandoff(false), 500);
    return () => clearTimeout(t);
  }, [session?.roomId]);

  const active = Boolean(playbackSourceUrl) && (!session || keepDuringMiniHandoff);
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
    left: -180,
    top: 0,
    width: 168,
    height: 298,
    opacity: 0.08,
    zIndex: 0,
    overflow: 'hidden',
  },
  video: {
    width: 168,
    height: 298,
  },
});
