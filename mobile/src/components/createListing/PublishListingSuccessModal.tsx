import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListingPreview } from '../../createListing/types';
import { colors, radii, spacing, typography } from '../../theme';

export type PublishSuccessVariant = 'marketplace' | 'live';

const COPY: Record<
  PublishSuccessVariant,
  { eyebrow: string; title: string; subtitle: string; primaryCta: string; secondaryCta: string }
> = {
  marketplace: {
    eyebrow: 'Listed · The Vault',
    title: 'Your grail is live.',
    subtitle: 'Collectors can discover it on Marketplace and Home — inventory just hit the floor.',
    primaryCta: 'Open Seller Studio',
    secondaryCta: 'Back to Seller HQ',
  },
  live: {
    eyebrow: 'Show inventory',
    title: 'Queued for the floor.',
    subtitle: 'Your piece is in the vault — run it from Live show listings in HQ.',
    primaryCta: 'Open Seller HQ',
    secondaryCta: 'Done',
  },
};

type Props = {
  visible: boolean;
  variant: PublishSuccessVariant;
  preview: ListingPreview | null;
  onViewListing: () => void;
  onSellerHQ: () => void;
  onDismiss: () => void;
};

export function PublishListingSuccessModal({
  visible,
  variant,
  preview,
  onViewListing,
  onSellerHQ,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const copy = COPY[variant];
  const glow = useRef(new Animated.Value(0.35)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const check = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      glow.setValue(0.35);
      scale.setValue(0.88);
      check.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 1100, useNativeDriver: true }),
      ]),
    );
    const enter = Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      Animated.timing(check, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]);
    pulse.start();
    enter.start();
    return () => {
      pulse.stop();
    };
  }, [visible, glow, scale, check]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <LinearGradient colors={['#1a1608', '#0c0c0c', '#050505']} style={styles.sheetGradient}>
            <View style={styles.handle} />

            <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
              <Animated.View style={[styles.glowRing, { opacity: glow }]} />
              <View style={styles.iconCircle}>
                <Animated.View style={{ opacity: check }}>
                  <Ionicons name="checkmark" size={40} color={colors.background} />
                </Animated.View>
              </View>
            </Animated.View>

            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>

            {preview ? (
              <View style={styles.previewRow}>
                {preview.imageUrl ? (
                  <Image source={{ uri: preview.imageUrl }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.previewText}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {preview.title}
                  </Text>
                  <Text style={styles.previewPrice}>{preview.price}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={styles.primaryBtn}
              onPress={variant === 'marketplace' ? onViewListing : onSellerHQ}
              accessibilityRole="button"
            >
              <LinearGradient colors={['#e8c96a', colors.gold, '#9a7b2c']} style={styles.primaryGradient}>
                <Text style={styles.primaryTxt}>{copy.primaryCta}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.background} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={variant === 'marketplace' ? onSellerHQ : onDismiss}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryTxt}>{copy.secondaryCta}</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sheetGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: spacing.lg,
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    backgroundColor: colors.gold,
    transform: [{ scale: 1.35 }],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  eyebrow: {
    ...typography.caption,
    color: colors.gold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.hero,
    fontSize: 26,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
  },
  thumbPlaceholder: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
    gap: 4,
  },
  previewTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  previewPrice: {
    ...typography.caption,
    color: colors.gold,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  primaryTxt: {
    ...typography.subtitle,
    color: colors.background,
    fontSize: 16,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryTxt: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
