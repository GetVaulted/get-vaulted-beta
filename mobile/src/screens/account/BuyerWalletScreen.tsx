import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { WalletAddressSetupModal } from '../../components/wallet/WalletAddressSetupModal';
import { WalletPaymentSetupModal } from '../../components/wallet/WalletPaymentSetupStep';
import {
  formatAddressOneLine,
  formatPaymentSummary,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from '../../components/wallet/walletSheetUtils';
import { useBuyerWalletReadiness } from '../../hooks/useBuyerWalletReadiness';
import {
  buyerWalletStatusDetail,
  buyerWalletStatusLabel,
} from '../../lib/buyerWalletReadinessDisplay';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
  type BuyerPaymentMethodRow,
  type BuyerShippingAddressRow,
} from '../../api/buyerWalletRepository';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerWallet'>;

export function BuyerWalletScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const readiness = useBuyerWalletReadiness(token, Boolean(token));
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethodRow[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const reloadDetails = useCallback(async () => {
    if (!token) return;
    const [pm, addrs] = await Promise.all([
      fetchBuyerPaymentMethods(token),
      fetchBuyerShippingAddresses(token),
    ]);
    setPaymentMethods(pm.paymentMethods);
    setAddresses(addrs);
    await readiness.refresh();
  }, [readiness.refresh, token]);

  useFocusEffect(
    useCallback(() => {
      void reloadDetails();
    }, [reloadDetails]),
  );

  const defaultAddress = pickDefaultShippingAddress(addresses);
  const primaryPayment = pickPrimaryPaymentMethod(paymentMethods);
  const statusLabel = buyerWalletStatusLabel(readiness);
  const statusDetail = buyerWalletStatusDetail(readiness);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Wallet"
        subtitle="Shipping and payment for live shows and checkout"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.banner, readiness.walletReady ? styles.bannerReady : styles.bannerSetup]}>
          <Ionicons
            name={readiness.walletReady ? 'checkmark-circle' : 'alert-circle-outline'}
            size={22}
            color={readiness.walletReady ? '#6ee7b7' : colors.gold}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.bannerTitle}>{statusLabel}</Text>
            <Text style={styles.bannerSub}>{statusDetail}</Text>
          </View>
        </View>

        <Pressable style={styles.card} onPress={() => setAddressModalOpen(true)}>
          <View style={styles.cardIcon}>
            <Ionicons name="location-outline" size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle}>Shipping address</Text>
            <Text style={[styles.cardSub, !readiness.shippingReady && styles.cardSubMissing]} numberOfLines={2}>
              {defaultAddress ? formatAddressOneLine(defaultAddress) : 'Add shipping address'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable style={styles.card} onPress={() => setPaymentModalOpen(true)}>
          <View style={styles.cardIcon}>
            <Ionicons name="card-outline" size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle}>Payment method</Text>
            <Text style={[styles.cardSub, !readiness.paymentReady && styles.cardSubMissing]} numberOfLines={2}>
              {formatPaymentSummary(primaryPayment)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </ScrollView>

      <WalletAddressSetupModal
        visible={addressModalOpen}
        accessToken={token}
        onClose={() => setAddressModalOpen(false)}
        onSaved={() => {
          setAddressModalOpen(false);
          void reloadDetails();
        }}
      />
      <WalletPaymentSetupModal
        visible={paymentModalOpen}
        accessToken={token}
        onClose={() => setPaymentModalOpen(false)}
        onSaved={() => {
          setPaymentModalOpen(false);
          void reloadDetails();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  bannerReady: {
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  bannerSetup: {
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  bannerSub: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  cardSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  cardSubMissing: { color: '#ffb4a8' },
});
