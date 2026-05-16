import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  resolveSellerHQEntryPhase,
  sellerHQEntryCopy,
  type SellerHQEntryPhase,
} from '../../lib/sellerHubEntry';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import { colors, radii, spacing, typography } from '../../theme';

export function SellerHQEntryBanner({
  hasUser,
  connect,
  connectLoading,
  onPress,
  compact,
}: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  connectLoading?: boolean;
  onPress: (phase: SellerHQEntryPhase) => void;
  compact?: boolean;
}) {
  const phase = resolveSellerHQEntryPhase({ hasUser, connect });
  const copy = sellerHQEntryCopy(phase);
  const ready = phase === 'ready';

  return (
    <Pressable
      onPress={() => onPress(phase)}
      style={({ pressed }) => [styles.wrap, compact && styles.wrapCompact, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={copy.cta}
    >
      <LinearGradient
        colors={
          ready
            ? ['rgba(212,175,55,0.28)', 'rgba(12,11,9,0.98)', 'rgba(5,5,5,0.99)']
            : ['rgba(80,70,40,0.35)', 'rgba(12,11,9,0.98)', 'rgba(5,5,5,0.99)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.row}>
        <View style={[styles.iconBubble, ready && styles.iconBubbleReady]}>
          <Ionicons name={copy.icon} size={compact ? 22 : 26} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, compact && styles.titleCompact]}>{copy.title}</Text>
          {!compact ? <Text style={styles.body}>{copy.body}</Text> : null}
        </View>
        <View style={styles.ctaCol}>
          {connectLoading && !connect ? (
            <ActivityIndicator color={colors.gold} size="small" />
          ) : (
            <>
              <Text style={styles.cta}>{copy.cta}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    overflow: 'hidden',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  wrapCompact: {
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleReady: {
    backgroundColor: 'rgba(52,199,89,0.15)',
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontSize: 17,
  },
  titleCompact: {
    fontSize: 15,
  },
  body: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  ctaCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: '38%',
  },
  cta: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
    textAlign: 'right',
  },
});
