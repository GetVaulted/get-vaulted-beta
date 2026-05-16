import { StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../../../theme';

export const hq = {
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  goldCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    overflow: 'hidden' as const,
    backgroundColor: colors.surfaceElevated,
  },
  elevatedShadow: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const hqStyles = StyleSheet.create({
  screenPad: { gap: spacing.lg },
});
