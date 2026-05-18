import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme';

const PLACEHOLDER = { blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH' };

type VaultImageProps = {
  uri?: string | null;
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
  width,
  height,
  borderRadius = 0,
  priority = 'normal',
  contentFit = 'cover',
  style,
  accessibilityLabel,
}: VaultImageProps) {
  return (
    <View
      style={[
        styles.frame,
        { width, height, borderRadius },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit={contentFit}
          transition={180}
          priority={priority}
          placeholder={PLACEHOLDER}
          recyclingKey={uri}
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
});
