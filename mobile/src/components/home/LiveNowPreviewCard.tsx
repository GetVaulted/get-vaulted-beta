import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import type { LiveStream } from '../../types';
import { LiveBadge } from '../ui/LiveBadge';

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k watching`;
  return `${n} watching`;
}

function categoryLine(stream: LiveStream) {
  return stream.categoryTags.slice(0, 2).join(' · ');
}

type Props = {
  stream: LiveStream;
  onPress: () => void;
  /** Slightly larger tile for the first home carousel slot — still restrained. */
  variant?: 'standard' | 'spotlight';
};

export function LiveNowPreviewCard({ stream, onPress, variant = 'standard' }: Props) {
  const spotlight = variant === 'spotlight';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        spotlight && styles.cardSpotlight,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.media, spotlight && styles.mediaSpotlight]}>
        <Image
          source={{ uri: stream.previewImageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.mediaTop}>
          <LiveBadge compact />
          <View style={styles.eyePill}>
            <Ionicons name="eye" size={13} color={colors.textSecondary} />
            <Text style={styles.eyeText}>{formatViewers(stream.viewers)}</Text>
          </View>
        </View>

        <View style={styles.mediaBottom}>
          <View style={styles.hostRow}>
            <Image source={{ uri: stream.host.avatarUrl }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.hostName} numberOfLines={1}>
                  {stream.host.name}
                </Text>
                {stream.host.verified ? (
                  <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
                ) : null}
              </View>
              <Text style={styles.showTitle} numberOfLines={2}>
                {stream.title}
              </Text>
              <Text style={styles.category}>{categoryLine(stream)}</Text>
              <Text style={styles.desc} numberOfLines={spotlight ? 3 : 2}>
                {stream.showDescription}
              </Text>
              {stream.engagementLine ? (
                <Text style={styles.activity} numberOfLines={1}>
                  {stream.engagementLine}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    marginRight: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSpotlight: {
    width: 300,
    borderColor: colors.borderStrong,
  },
  pressed: {
    opacity: 0.96,
  },
  media: {
    borderRadius: radii.lg,
    minHeight: 360,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  mediaSpotlight: {
    minHeight: 400,
  },
  mediaTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  eyePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 150,
  },
  eyeText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  mediaBottom: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  hostRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hostName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  showTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.sm,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  category: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  desc: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  activity: {
    ...typography.caption,
    marginTop: spacing.md,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
