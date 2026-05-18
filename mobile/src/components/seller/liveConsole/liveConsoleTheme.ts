import { StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

export const lc = {
  glass: {
    backgroundColor: 'rgba(12, 11, 9, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.22)',
  },
  goldGlow: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
    color: colors.gold,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
};

export const liveConsoleStyles = StyleSheet.create({
  dockShell: {
    flex: 1,
    marginTop: -spacing.sm,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(8,8,10,0.97)',
  },
  dockHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    ...lc.glass,
  },
  pillVal: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  pillLbl: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
});
