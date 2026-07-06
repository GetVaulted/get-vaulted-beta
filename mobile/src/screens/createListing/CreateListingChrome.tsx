import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingAssistantFAB } from '../../createListing/ListingAssistantFAB';
import { MARKETPLACE_LISTING_AI_ENABLED } from '../../createListing/listingAiAssistantEnabled';
import type { ListingChannel } from '../../createListing/listingChannel';
import { LISTING_CHANNEL_CONFIG, LISTING_STEP_LABELS } from '../../createListing/listingChannel';
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
  const stepLabel = LISTING_STEP_LABELS[step] ?? 'Step';
  const progress = Math.min(1, Math.max(0, (step + 1) / total));

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={
          isLive
            ? ['rgba(255,69,58,0.14)', 'rgba(5,5,5,0.98)', colors.background]
            : ['rgba(212,175,55,0.1)', 'rgba(5,5,5,0.98)', colors.background]
        }
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={[styles.inner, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.head}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.headBtn, pressed && styles.headBtnPressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
          ) : (
            <View style={styles.headBtnSpacer} />
          )}

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent.primary }]} />
            </View>
            <Text style={styles.progressMeta}>
              {stepLabel} · {step + 1}/{total}
            </Text>
          </View>

          <Pressable
            onPress={onExit}
            style={({ pressed }) => [styles.headBtn, pressed && styles.headBtnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Exit listing"
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={[styles.channelPill, { borderColor: accent.border, backgroundColor: accent.fill }]}>
          <View style={[styles.channelDot, { backgroundColor: accent.primary }]} />
          <Ionicons name={accent.icon} size={14} color={accent.primary} />
          <Text style={[styles.channelPillText, { color: accent.primary }]}>{accent.shortLabel}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {children}
        </KeyboardAvoidingView>

        {(channel !== 'marketplace' || MARKETPLACE_LISTING_AI_ENABLED) ? (
          <ListingAssistantFAB bottomOffset={108} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headBtnPressed: { opacity: 0.75 },
  headBtnSpacer: {
    width: 40,
    height: 40,
  },
  progressWrap: {
    flex: 1,
    gap: 6,
    paddingHorizontal: spacing.xs,
  },
  progressTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  progressMeta: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  channelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  channelPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: spacing.xs,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  body: { flex: 1, flexDirection: 'column' },
});

