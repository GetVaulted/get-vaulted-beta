import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import {
  resolveSellerHQEntryPhase,
  sellerHQEntryCopy,
  type SellerHQEntryPhase,
} from '../../lib/sellerHubEntry';
import { colors, radii, spacing } from '../../theme';

/**
 * Compact seller onboarding only — never shows "Command Center" on Home.
 * Approved sellers use Seller HQ tab; no permanent ops tile on the feed.
 */
export function HomeSellerOnboardingStrip({
  hasUser,
  connect,
  onPress,
}: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  onPress: (phase: SellerHQEntryPhase) => void;
}) {
  const phase = resolveSellerHQEntryPhase({ hasUser, connect });
  if (phase === 'ready') return null;

  const copy = sellerHQEntryCopy(phase);

  return (
    <Pressable
      onPress={() => onPress(phase)}
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
