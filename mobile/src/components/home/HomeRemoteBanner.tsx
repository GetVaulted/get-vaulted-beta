import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PublicAppBanner } from '../../api/appBannerRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  banner: PublicAppBanner;
  onPress: () => void;
  onDismiss: () => void;
};

export function HomeRemoteBanner({ banner, onPress, onDismiss }: Props) {
  const tappable = Boolean(banner.href.trim());
  const content = (
    <>
      <LinearGradient
        colors={['rgba(212,175,55,0.22)', 'rgba(20,17,10,0.95)', 'rgba(12,12,16,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Promo</Text>
          {banner.title ? <Text style={styles.title}>{banner.title}</Text> : null}
          {banner.body ? <Text style={styles.body}>{banner.body}</Text> : null}
          {banner.ctaLabel ? (
            <View style={styles.ctaChip}>
              <Text style={styles.ctaText}>{banner.ctaLabel}</Text>
              {tappable ? <Ionicons name="arrow-forward" size={12} color="#0a0a0a" /> : null}
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss promo"
          style={styles.dismiss}
        >
          <Ionicons name="close" size={18} color="rgba(244,241,234,0.55)" />
        </Pressable>
      </View>
    </>
  );

  if (!tappable) {
    return <View style={styles.wrap}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={banner.ctaLabel || banner.title || 'Open promo'}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.92,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  body: {
    color: 'rgba(244,241,234,0.7)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  ctaChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaText: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: '800',
  },
  dismiss: {
    padding: 2,
  },
});
