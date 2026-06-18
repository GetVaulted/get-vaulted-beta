import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { normalizeAvatarUri, profileDisplayInitial } from '../../lib/profileAvatar';
import { colors } from '../../theme';

type Props = {
  uri?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
  borderColor?: string;
  borderWidth?: number;
  /** Dark overlay contexts (live stage) vs light cards (seller HQ). */
  tone?: 'dark' | 'light';
};

export function UserAvatar({
  uri,
  name,
  username,
  size = 40,
  style,
  textStyle,
  borderColor,
  borderWidth,
  tone = 'dark',
}: Props) {
  const imageUri = normalizeAvatarUri(uri);
  const initial = profileDisplayInitial(name, username);
  const radius = size / 2;
  const ring = borderWidth ?? StyleSheet.hairlineWidth;
  const ringColor = borderColor ?? (tone === 'light' ? colors.borderStrong : 'rgba(255,255,255,0.28)');

  if (imageUri) {
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: radius, borderWidth: ring, borderColor: ringColor, overflow: 'hidden' },
          style as StyleProp<ViewStyle>,
        ]}
      >
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          transition={100}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        tone === 'light' && styles.fallbackLight,
        { width: size, height: size, borderRadius: radius, borderWidth: ring, borderColor: ringColor },
        style,
      ]}
    >
      <Text
        style={[
          styles.initial,
          tone === 'light' && styles.initialLight,
          { fontSize: Math.max(11, Math.round(size * 0.4)) },
          textStyle,
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fallbackLight: {
    backgroundColor: colors.surface,
  },
  initial: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '900',
  },
  initialLight: {
    color: colors.gold,
  },
});
