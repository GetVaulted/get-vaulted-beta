import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';
import type { HotClip } from '../../types';

function categoryIcon(cat: HotClip['category']): keyof typeof Ionicons.glyphMap {
  switch (cat) {
    case 'watches':
      return 'time-outline';
    case 'sneakers':
      return 'footsteps-outline';
    case 'cards':
      return 'layers-outline';
    case 'memorabilia':
      return 'trophy-outline';
    case 'luxury':
      return 'diamond-outline';
    case 'other':
      return 'apps-outline';
    default:
      return 'diamond-outline';
  }
}

type Props = {
  clip: HotClip;
  onOpen?: (roomId: string) => void;
};

export function HotClipCard({ clip, onOpen }: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const openClip = () => {
    if (clip.roomId && onOpen) {
      onOpen(clip.roomId);
      return;
    }
    navigation.navigate('Live', { screen: 'LiveDiscovery' });
  };

  const shareClip = async () => {
    try {
      await Share.share({
        title: clip.title,
        message: `${clip.title} — watch live on Get Vaulted`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={openClip}
    >
      <View style={styles.thumb}>
        {clip.imageUrl ? (
          <Image source={{ uri: clip.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <LinearGradient
          colors={clip.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, clip.imageUrl && styles.gradientTint]}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.75)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.thumbTop}>
          <View style={styles.playRing}>
            <Ionicons name="play" size={14} color={colors.textPrimary} />
          </View>
          <Pressable hitSlop={12} onPress={() => void shareClip()}>
            <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Ionicons
          name={categoryIcon(clip.category)}
          size={56}
          color="rgba(255,255,255,0.05)"
          style={styles.watermark}
        />
        <View style={styles.thumbBottom}>
          <Text style={styles.title} numberOfLines={2}>
            {clip.title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
            <Text style={styles.views}>{clip.views} views</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    marginRight: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.96,
  },
  thumb: {
    minHeight: 220,
    justifyContent: 'space-between',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  gradientTint: {
    opacity: 0.45,
  },
  thumbTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    zIndex: 2,
  },
  playRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermark: {
    position: 'absolute',
    alignSelf: 'center',
    top: '28%',
  },
  thumbBottom: {
    padding: spacing.md,
    gap: 6,
    zIndex: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  views: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
