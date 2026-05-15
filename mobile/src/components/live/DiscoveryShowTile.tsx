import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { LiveBadge } from '../ui/LiveBadge';
import { categoryMeta } from '../../data/categoryTaxonomy';

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function categoryLine(show: LiveStream) {
  return show.categoryTags.slice(0, 2).join(' · ') || categoryMeta[show.category].label;
}

type Props = {
  show: LiveStream;
  onPress: () => void;
  variant?: 'default' | 'compact' | 'hero';
  tileWidth?: number;
};

export function DiscoveryShowTile({ show, onPress, variant = 'default', tileWidth }: Props) {
  const isHero = variant === 'hero';
  const w =
    tileWidth ?? (variant === 'compact' ? 200 : variant === 'hero' ? undefined : 240);
  const minH = variant === 'hero' ? 400 : variant === 'compact' ? 200 : 260;

  const overlayGradient = isHero
    ? (['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.88)'] as const)
    : (['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)'] as const);
  const overlayLocations = isHero ? ([0, 0.42, 1] as const) : ([0, 0.5, 1] as const);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        w != null && { width: w },
        isHero && styles.heroWrap,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.thumb, { minHeight: minH }, isHero && styles.thumbHero]}>
        <Image
          source={{ uri: show.previewImageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {isHero ? (
          <LinearGradient
            colors={show.thumbnailGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.heroTintWash]}
          />
        ) : null}
        <LinearGradient
          colors={overlayGradient}
          locations={overlayLocations}
          style={StyleSheet.absoluteFill}
        />
        {isHero ? <View style={styles.heroFrame} pointerEvents="none" /> : null}

        <View style={styles.topRow}>
          <LiveBadge compact />
          <View style={styles.eye}>
            <Ionicons name="eye" size={12} color={colors.textSecondary} />
            <Text style={styles.eyeText}>{formatViewers(show.viewers)}</Text>
          </View>
        </View>

        <View style={[styles.bottom, isHero && styles.bottomHero]}>
          <View style={styles.hostMini}>
            <Image
              source={{ uri: show.host.avatarUrl }}
              style={[styles.avatar, isHero && styles.avatarHero]}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.hostName, isHero && styles.hostNameHero]} numberOfLines={1}>
                  {show.host.name}
                </Text>
                {show.host.verified ? (
                  <Ionicons name="checkmark-circle" size={isHero ? 17 : 15} color={colors.gold} />
                ) : null}
              </View>
              <Text style={[styles.title, isHero && styles.titleHero]} numberOfLines={2}>
                {show.title}
              </Text>
              <Text style={styles.cat}>{categoryLine(show)}</Text>
              {show.showDescription ? (
                <Text style={styles.blurb} numberOfLines={isHero ? 2 : 1}>
                  {show.showDescription}
                </Text>
              ) : null}
              {show.engagementLine ? (
                <Text style={styles.activity} numberOfLines={1}>
                  {show.engagementLine}
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
  wrap: {
    marginRight: spacing.md,
  },
  heroWrap: {
    marginRight: 0,
    width: '100%',
  },
  pressed: {
    opacity: 0.96,
  },
  thumb: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  thumbHero: {
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
  },
  heroTintWash: {
    opacity: 0.32,
  },
  /** Inset cinematic frame — reads as a preview surface, not a flat card. */
  heroFrame: {
    ...StyleSheet.absoluteFillObject,
    margin: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  eye: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eyeText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  bottom: {
    padding: spacing.lg,
  },
  bottomHero: {
    padding: spacing.xl,
  },
  hostMini: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarHero: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hostName: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  hostNameHero: {
    fontSize: 16,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginTop: spacing.sm,
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  titleHero: {
    fontSize: 20,
    lineHeight: 26,
    marginTop: spacing.md,
  },
  cat: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  blurb: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  activity: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
