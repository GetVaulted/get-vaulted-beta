import { StyleSheet, View } from 'react-native';
import { ExpoIVSStagePreviewView } from 'expo-realtime-ivs-broadcast';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import { sellerPreviewMirror } from '../../../lib/sellerHostCamera';

type Props = {
  active: boolean;
  cameraFacing?: SellerCameraFacing;
  contentFit?: 'cover' | 'contain';
};

/** Native IVS Real-Time Stage local camera preview for the seller host. */
export function StageHostPreviewVideo({
  active,
  cameraFacing = 'back',
  contentFit = 'cover',
}: Props) {
  if (!active) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <ExpoIVSStagePreviewView
        style={styles.video}
        mirror={sellerPreviewMirror(cameraFacing)}
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
