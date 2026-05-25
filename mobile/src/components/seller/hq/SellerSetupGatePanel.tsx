import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sellerSetupMenuLabel } from '../../../lib/seller-setup-state';
import type { SellerSetupPhase } from '../../../lib/seller-setup-state';
import { openSellerSetup } from '../../../navigation/openSellerSetup';
import { colors, spacing } from '../../../theme';

/** Shown inside Seller HQ tab when seller is not fully activated. */
export function SellerSetupGatePanel({
  phase,
  onSignUp,
}: {
  phase: SellerSetupPhase;
  onSignUp?: () => void;
}) {
  const label = sellerSetupMenuLabel(phase === 'loading' ? 'not_started' : phase);
  const body =
    phase === 'not_started'
      ? 'Set up your seller account to list inventory, run live shows, and get paid.'
      : 'Complete payout and shipping setup to unlock Seller HQ.';

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name="storefront-outline" size={28} color={colors.gold} />
      </View>
      <Text style={styles.title}>Seller Setup</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable onPress={() => (onSignUp ? onSignUp() : openSellerSetup())} style={({ pressed }) => pressed && { opacity: 0.92 }}>
        <LinearGradient colors={[colors.gold, '#E8D48B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
          <Text style={styles.ctaText}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  cta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 999,
    minWidth: 220,
    alignItems: 'center',
  },
  ctaText: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
});
