import { Platform, StyleSheet, View } from 'react-native';
import { loadAgoraSdk } from '../../../lib/agoraEngine';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import { sellerPreviewMirror } from '../../../lib/sellerHostCamera';

type Props = {
  active: boolean;
  cameraFacing?: SellerCameraFacing;
  mirrorOverride?: boolean | null;
  contentFit?: 'cover' | 'contain';
};

/** Local camera preview for the Agora host publisher (same slot as the IVS preview view). */
export function AgoraHostPreviewVideo({
  active,
  cameraFacing = 'back',
  mirrorOverride = null,
  contentFit = 'cover',
}: Props) {
  const lib = loadAgoraSdk();
  if (!active || !lib) return null;

  // Android: a texture view composites correctly under the host overlays (a surface view can punch through).
  const PreviewView = Platform.OS === 'android' ? lib.RtcTextureView : lib.RtcSurfaceView;
  const mirror = sellerPreviewMirror(cameraFacing, mirrorOverride);

  return (
    <View style={styles.root} pointerEvents="none">
      <PreviewView
        style={styles.video}
        canvas={{
          uid: 0,
          sourceType: lib.VideoSourceType.VideoSourceCamera,
          renderMode: contentFit === 'cover' ? lib.RenderModeType.RenderModeHidden : lib.RenderModeType.RenderModeFit,
          mirrorMode: mirror
            ? lib.VideoMirrorModeType.VideoMirrorModeEnabled
            : lib.VideoMirrorModeType.VideoMirrorModeDisabled,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  video: { ...StyleSheet.absoluteFillObject },
});
