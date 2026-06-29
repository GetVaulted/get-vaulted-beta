import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BuyerWalletReadiness } from '../../lib/buyerWalletErrors';
import { buyerWalletGatePromptBody } from '../../lib/buyerWalletReadinessDisplay';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  readiness: BuyerWalletReadiness;
  onSetupWallet: () => void;
  onLeaveRoom: () => void;
};

export function LiveBuyerWalletGateModal({ visible, readiness, onSetupWallet, onLeaveRoom }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onLeaveRoom}
    >
      <View style={styles.backdrop} pointerEvents="box-none" accessibilityViewIsModal>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="wallet-outline" size={22} color={colors.gold} />
          </View>
          <Text style={styles.title}>Wallet required</Text>
          <Text style={styles.body}>{buyerWalletGatePromptBody(readiness)}</Text>
          <Text style={styles.hint}>
            Set up once — used for live bids, buy now, and break spots in this show.
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.primaryBtn}
              onPress={onSetupWallet}
              accessibilityRole="button"
              accessibilityLabel="Set up wallet"
            >
              <Text pointerEvents="none" style={styles.primaryLabel}>
                Set up wallet
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={onLeaveRoom}
              accessibilityRole="button"
              accessibilityLabel="Leave room"
            >
              <Text pointerEvents="none" style={styles.secondaryLabel}>
                Leave room
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.22)',
    backgroundColor: 'rgba(10, 10, 11, 0.96)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + 4,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.28)',
    backgroundColor: 'rgba(255, 215, 80, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  actions: {
    marginTop: spacing.lg,
    width: '100%',
    gap: spacing.sm,
  },
  primaryBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.background,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  secondaryBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
