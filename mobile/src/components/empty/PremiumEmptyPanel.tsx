import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

export type PremiumEmptyAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** Optional kicker above title */
  kicker?: string;
  actions?: PremiumEmptyAction[];
};

export function PremiumEmptyPanel({ icon, title, subtitle, kicker, actions }: Props) {
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={26} color={colors.gold} />
      </View>
      {kicker ? (
        <Text style={styles.kicker} numberOfLines={1}>
          {kicker}
        </Text>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      {actions?.length ? (
        <View style={styles.actions}>
          {actions.map((a) =>
            a.variant === 'secondary' ? (
              <Pressable key={a.label} style={styles.btnSecondary} onPress={a.onPress}>
                <Text style={styles.btnSecondaryTxt}>{a.label}</Text>
              </Pressable>
            ) : (
              <Pressable key={a.label} style={styles.btnPrimary} onPress={a.onPress}>
                <Text style={styles.btnPrimaryTxt}>{a.label}</Text>
              </Pressable>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
    minHeight: 132,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginBottom: spacing.xs,
  },
  kicker: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 18,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 520,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  btnPrimaryTxt: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  btnSecondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnSecondaryTxt: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 14,
  },
});
