import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useScreenSafeInsets } from '../../lib/screenSafeInsets';
import { colors, radii, spacing, typography } from '../../theme';

type FooterProps = {
  accentPrimary?: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  backLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
};

export function CreateListingFooter({
  accentPrimary = colors.gold,
  onBack,
  onNext,
  nextLabel,
  backLabel = 'Back',
  disabled,
  loading,
  onSaveDraft,
  saveDraftLabel = 'Save draft',
}: FooterProps) {
  const insets = useScreenSafeInsets();
  const off = disabled || loading;

  return (
    <View style={[wizardStyles.footerShell, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={wizardStyles.footerDivider} />
      {onSaveDraft ? (
        <Pressable
          style={({ pressed }) => [wizardStyles.footerSaveDraft, pressed && wizardStyles.footerBackPressed]}
          onPress={onSaveDraft}
          accessibilityRole="button"
          accessibilityLabel={saveDraftLabel}
        >
          <Ionicons name="bookmark-outline" size={16} color={colors.textSecondary} />
          <Text style={wizardStyles.footerSaveDraftTxt}>{saveDraftLabel}</Text>
        </Pressable>
      ) : null}
      <View style={wizardStyles.footerRow}>
        {onBack ? (
          <Pressable
            style={({ pressed }) => [wizardStyles.footerBack, pressed && wizardStyles.footerBackPressed]}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            <Text style={wizardStyles.footerBackTxt}>{backLabel}</Text>
          </Pressable>
        ) : (
          <View style={wizardStyles.footerBackSpacer} />
        )}
        <Pressable
          style={({ pressed }) => [
            wizardStyles.footerNext,
            { backgroundColor: accentPrimary },
            off && wizardStyles.footerNextOff,
            pressed && !off && wizardStyles.footerNextPressed,
          ]}
          onPress={() => !off && onNext()}
          disabled={off}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <>
              <Text style={wizardStyles.footerNextTxt}>{nextLabel}</Text>
              <Ionicons name="arrow-forward" size={18} color="#0a0a0a" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function WizardInfoBanner({
  accentPrimary = colors.gold,
  accentFill = colors.goldSoft,
  accentBorder = colors.borderStrong,
  icon = 'information-circle-outline',
  children,
  style,
}: {
  accentPrimary?: string;
  accentFill?: string;
  accentBorder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[wizardStyles.infoBanner, { borderColor: accentBorder, backgroundColor: accentFill }, style]}>
      <Ionicons name={icon} size={18} color={accentPrimary} />
      <Text style={wizardStyles.infoBannerText}>{children}</Text>
    </View>
  );
}

export function WizardSectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={wizardStyles.sectionHeader}>
      <Text style={wizardStyles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={wizardStyles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function WizardReviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={wizardStyles.reviewBlock}>
      <Text style={wizardStyles.reviewBlockTitle}>{title}</Text>
      <View style={wizardStyles.reviewBlockBody}>{children}</View>
    </View>
  );
}

export const wizardStyles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  footerShell: {
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  footerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minWidth: 88,
  },
  footerBackPressed: { opacity: 0.7 },
  footerBackTxt: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
  footerBackSpacer: { width: 88 },
  footerSaveDraft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: spacing.sm,
  },
  footerSaveDraftTxt: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  footerNext: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  footerNextPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  footerNextOff: { opacity: 0.42, shadowOpacity: 0 },
  footerNextTxt: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  infoBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeader: {
    gap: 4,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
  },
  optionCardSelected: {
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  optionSub: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  dropZone: {
    minHeight: 176,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  dropTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dropSub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  dropActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dropActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dropActionTxt: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  fieldInput: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    backgroundColor: colors.surfaceElevated,
  },
  reviewBlock: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  reviewBlockTitle: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  reviewBlockBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: 6,
  },
  reviewLine: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  reviewLineStrong: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  reviewLineMuted: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
