import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingAssistantFAB } from '../../createListing/ListingAssistantFAB';
import type { ListingChannel } from '../../createListing/listingChannel';
import { LISTING_CHANNEL_CONFIG } from '../../createListing/listingChannel';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  channel: ListingChannel;
  /** Previous step in the listing flow. Omit on the first screen only. */
  onBack?: () => void;
  /** Leave the entire create-listing flow. */
  onExit: () => void;
  children: ReactNode;
};

export function CreateListingChrome({
  step,
  total,
  title,
  subtitle,
  channel,
  onBack,
  onExit,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const accent = LISTING_CHANNEL_CONFIG[channel];
  const isLive = channel === 'live_show';

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.head}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.headBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.headBtnSpacer} />
        )}
        <View style={styles.progress}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={String(i)}
              style={[styles.seg, i <= step && { backgroundColor: accent.primary }]}
            />
          ))}
        </View>
        <Pressable
          onPress={onExit}
          style={styles.headBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Exit listing"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={[styles.channelPill, { borderColor: accent.border, backgroundColor: accent.fill }]}>
        <Ionicons name={accent.icon} size={14} color={accent.primary} />
        <Text style={[styles.channelPillText, { color: accent.primary }]}>{accent.shortLabel}</Text>
        <Text style={styles.channelPillDest}>
          {isLive ? '→ Live show queue' : '→ Vault marketplace'}
        </Text>
      </View>

      <Text style={[styles.kicker, { color: accent.primary }]}>
        {accent.shortLabel} · Step {step + 1} of {total}
      </Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      <LinearGradient
        colors={isLive ? ['rgba(255,69,58,0.08)', 'transparent'] : ['rgba(212,175,55,0.06)', 'transparent']}
        style={styles.glow}
        pointerEvents="none"
      />
      <View style={styles.body}>{children}</View>
      <ListingAssistantFAB bottomOffset={96} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headBtnSpacer: {
    width: 40,
    height: 40,
  },
  progress: { flex: 1, flexDirection: 'row', gap: 4, marginHorizontal: spacing.sm },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  channelPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  channelPillDest: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  kicker: {
    ...typography.micro,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    fontSize: 26,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 100,
    height: 120,
  },
  body: { flex: 1, flexDirection: 'column' },
});
