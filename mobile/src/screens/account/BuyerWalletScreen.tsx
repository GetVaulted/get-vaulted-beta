import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/AuthContext';
import { WalletAddressSetupModal } from '../../components/wallet/WalletAddressSetupModal';
import { WalletPaymentSetupModal } from '../../components/wallet/WalletPaymentSetupStep';
import { vaultWalletTheme as t } from '../../components/wallet/vaultWalletTheme';
import {
  formatAddressOneLine,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from '../../components/wallet/walletSheetUtils';
import { formatUsd, walletPmSummary } from '../../components/wallet/walletPaymentMethodDisplay';
import { useBuyerWalletReadiness } from '../../hooks/useBuyerWalletReadiness';
import {
  buyerWalletStatusDetail,
  buyerWalletStatusLabel,
} from '../../lib/buyerWalletReadinessDisplay';
import {
  fetchBuyerShippingAddresses,
  fetchBuyerWalletSummary,
  type BuyerShippingAddressRow,
  type BuyerWalletSummary,
} from '../../api/buyerWalletRepository';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerWallet'>;

function SectionCard({
  icon,
  title,
  subtitle,
  trailing,
  warn,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  trailing?: string;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={[styles.cardSub, warn && styles.cardSubWarn]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function BuyerWalletScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const readiness = useBuyerWalletReadiness(token, Boolean(token));
  const [summary, setSummary] = useState<BuyerWalletSummary | null>(null);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<'credits' | 'promo' | 'referral' | null>(null);

  const reloadDetails = useCallback(async () => {
    if (!token) return;
    const [wallet, addrs] = await Promise.all([
      fetchBuyerWalletSummary(token).catch(() => null),
      fetchBuyerShippingAddresses(token),
    ]);
    setSummary(wallet);
    setAddresses(addrs);
    await readiness.refresh();
  }, [readiness.refresh, token]);

  useFocusEffect(
    useCallback(() => {
      void reloadDetails();
    }, [reloadDetails]),
  );

  const defaultAddress = pickDefaultShippingAddress(addresses);
  const primaryPayment = pickPrimaryPaymentMethod(summary?.paymentMethods ?? []);
  const statusLabel = buyerWalletStatusLabel(readiness);
  const statusDetail = buyerWalletStatusDetail(readiness);
  const creditsUsd = summary?.vaultCreditsUsd ?? 0;
  const referralUsd = summary?.referralCreditUsd ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.gold} />
        </Pressable>
        <Text style={styles.topTitle}>Vault Wallet</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={t.hero}>
          <View style={t.heroIcon}>
            <Ionicons name="wallet" size={24} color={colors.gold} />
          </View>
          <Text style={styles.heroTitle}>Vault Wallet</Text>
          <Text style={styles.heroSub}>
            Shipping, payments, and credits for live shows, marketplace, offers, and trades.
          </Text>
          <View style={[t.readinessPill, readiness.walletReady ? t.readinessReady : t.readinessSetup]}>
            <Ionicons
              name={readiness.walletReady ? 'checkmark-circle' : 'alert-circle-outline'}
              size={14}
              color={readiness.walletReady ? '#6ee7b7' : colors.gold}
            />
            <Text style={[t.readinessTxt, readiness.walletReady ? t.readinessTxtReady : t.readinessTxtSetup]}>
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.statusDetail}>{statusDetail}</Text>
        </View>

        <SectionCard
          icon="location-outline"
          title="Shipping Address"
          subtitle={defaultAddress ? formatAddressOneLine(defaultAddress) : 'Add shipping address'}
          warn={!readiness.shippingReady}
          onPress={() => setAddressModalOpen(true)}
        />
        <SectionCard
          icon="card-outline"
          title="Payment Methods"
          subtitle={walletPmSummary(primaryPayment)}
          warn={!readiness.paymentReady}
          onPress={() => setPaymentModalOpen(true)}
        />
        <SectionCard
          icon="diamond-outline"
          title="Vault Credits"
          subtitle={creditsUsd > 0 ? 'Apply at checkout' : 'No credits yet'}
          trailing={formatUsd(creditsUsd)}
          onPress={() => {
            setSheetStep('credits');
            setSheetOpen(true);
          }}
        />
        <SectionCard
          icon="pricetag-outline"
          title="Promo Code"
          subtitle={summary?.promoCodeApplied ? `Applied: ${summary.promoCodeApplied}` : 'Promo codes coming soon'}
          onPress={() => {
            setSheetStep('promo');
            setSheetOpen(true);
          }}
        />
        <SectionCard
          icon="people-outline"
          title="Referral Credit"
          subtitle={referralUsd > 0 ? 'Eligible to apply' : 'Invite friends to earn'}
          trailing={formatUsd(referralUsd)}
          onPress={() => {
            setSheetStep('referral');
            setSheetOpen(true);
          }}
        />
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

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={t.backdrop}>
          <View style={[t.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={t.handle} />
            <Text style={styles.sheetTitle}>
              {sheetStep === 'credits' ? 'Vault Credits' : sheetStep === 'promo' ? 'Promo Code' : 'Referral Credit'}
            </Text>
            <Text style={styles.sheetBody}>
              {sheetStep === 'credits'
                ? `Available balance: ${formatUsd(creditsUsd)}. Credits apply at checkout when eligible.`
                : sheetStep === 'promo'
                  ? 'Promo codes are not available in Vault Wallet yet. Checkout promo support is coming in a future update.'
                  : `Referral credit: ${formatUsd(referralUsd)}. Invite friends to earn more.`}
            </Text>
            <Pressable style={t.primaryBtn} onPress={() => setSheetOpen(false)}>
              <Text style={t.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0c0b10' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 32 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', color: '#faf8f2' },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#faf8f2' },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.52)',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: spacing.md,
  },
  statusDetail: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  cardPressed: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(201,162,39,0.22)' },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,162,39,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,39,0.25)',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#f4f2ec' },
  cardSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.55)' },
  cardSubWarn: { color: '#fbbf24', fontWeight: '700' },
  trailing: { fontSize: 13, fontWeight: '800', color: colors.gold, marginRight: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: spacing.sm, textAlign: 'center' },
  sheetBody: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.62)', marginBottom: spacing.lg },
});
