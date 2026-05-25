import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  sellerSetupStripCopy,
  type SellerSetupPhase,
} from '../../lib/seller-setup-state';
import { colors, radii, spacing } from '../../theme';

/**
 * Compact seller onboarding only — never shows Seller HQ ops on Home.
 * Activated sellers use the HQ tab; no permanent ops tile on the feed.
 */
export function HomeSellerOnboardingStrip({
  hasUser,
  phase,
  onPress,
}: {
  hasUser: boolean;
  phase: SellerSetupPhase;
  onPress: () => void;
}) {
  if (!hasUser || phase === 'loading' || phase === 'ready') return null;

  const copy = sellerSetupStripCopy(phase);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={copy.cta}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={copy.icon} size={18} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {copy.body}
        </Text>
      </View>
      <Text style={styles.cta}>{copy.cta}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pressed: { opacity: 0.92 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  body: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  cta: { fontSize: 12, fontWeight: '700', color: colors.gold },
});
