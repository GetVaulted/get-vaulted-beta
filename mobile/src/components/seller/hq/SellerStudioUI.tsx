import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../../theme';

export function StudioSection({
  title,
  subtitle,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[studioStyles.section, style]}>
      <View style={studioStyles.sectionHead}>
        <Text style={studioStyles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={studioStyles.sectionSub}>{subtitle}</Text> : null}
      </View>
      <View style={studioStyles.sectionBody}>{children}</View>
    </View>
  );
}

export function StudioPrimaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        studioStyles.primaryBtn,
        disabled && studioStyles.btnOff,
        pressed && !disabled && studioStyles.btnPressed,
      ]}
      onPress={() => !disabled && onPress()}
      disabled={disabled}
    >
      {icon ? <Ionicons name={icon} size={18} color="#0a0a0a" /> : null}
      <Text style={studioStyles.primaryBtnTxt}>{label}</Text>
    </Pressable>
  );
}

export function StudioSecondaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        studioStyles.secondaryBtn,
        disabled && studioStyles.btnOff,
        pressed && !disabled && studioStyles.btnPressed,
      ]}
      onPress={() => !disabled && onPress()}
      disabled={disabled}
    >
      {icon ? <Ionicons name={icon} size={16} color={colors.textSecondary} /> : null}
      <Text style={studioStyles.secondaryBtnTxt}>{label}</Text>
    </Pressable>
  );
}

export function StudioMetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={studioStyles.metricTile}>
      <Text style={studioStyles.metricValue}>{value}</Text>
      <Text style={studioStyles.metricLabel}>{label}</Text>
    </View>
  );
}

export function StudioFieldLabel({ children }: { children: string }) {
  return <Text style={studioStyles.fieldLabel}>{children}</Text>;
}

export const studioStyles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerCenter: { flex: 1, minWidth: 0 },
  headerKicker: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 1.1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  heroCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  heroThumb: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  heroBody: { flex: 1, justifyContent: 'center', gap: 6 },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  statusPillText: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroMeta: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  section: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  sectionHead: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  sectionSub: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  sectionBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: radii.lg,
    marginTop: spacing.xs,
  },
  primaryBtnTxt: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  secondaryBtnTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  dangerBtn: {
    backgroundColor: 'rgba(139,46,46,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.35)',
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  dangerBtnTxt: { color: '#ffb4a8', fontWeight: '800', fontSize: 14 },
  btnOff: { opacity: 0.45 },
  btnPressed: { opacity: 0.92 },
});
