import { StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export const walletPaymentSetupStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0d',
  },
  body: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: 44,
  },
  headerSpacer: { width: 28 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  supportLine: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  introCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  introTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  introBody: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    lineHeight: 18,
  },
  cardFieldWrap: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  cardFieldLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  cardFieldFixed: {
    width: '100%',
    height: 52,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0a0a0d',
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorText: { color: '#fca5a5', fontSize: 13, fontWeight: '600' },
  hintText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
