import { Image, type ImageContentFit, type ImageContentPosition } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DEFAULT_LIVE_ROOM_PREVIEW_IMAGE } from '../../lib/liveRoomPreviewImage';
import { colors } from '../../theme';

const PLACEHOLDER = { blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH' };

type VaultImageProps = {
  uri?: string | null;
  /** Used when `uri` is missing or fails to load. */
  fallbackUri?: string;
  width: number;
  height: number;
  borderRadius?: number;
  priority?: 'low' | 'normal' | 'high';
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Stable-size remote image with placeholder — reduces layout shift on rails and hero cards. */
export function VaultImage({
  uri,
  fallbackUri = DEFAULT_LIVE_ROOM_PREVIEW_IMAGE,
  width,
  height,
  borderRadius = 0,
  priority = 'normal',
  contentFit = 'cover',
  contentPosition = 'center',
  style,
  accessibilityLabel,
}: VaultImageProps) {
  const resolvedUri = uri?.trim() || fallbackUri;

  return (
    <View
      style={[
        styles.frame,
        { width, height, borderRadius },
        style,
      ]}
    >
      <LinearGradient
        colors={['#141820', '#0a0c10']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Image
        source={{ uri: resolvedUri }}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit}
        contentPosition={contentPosition}
        transition={180}
        priority={priority}
        placeholder={PLACEHOLDER}
        recyclingKey={resolvedUri}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
});
