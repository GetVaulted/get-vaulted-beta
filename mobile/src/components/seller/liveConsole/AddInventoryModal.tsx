import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  auctionPricingFromItem,
  validateAuctionPricing,
  type AuctionPricingInput,
  type AuctionPricingValues,
} from '../../../lib/liveAuctionPricing';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, radii, spacing } from '../../../theme';
import { AuctionPricingFields } from './AuctionPricingFields';

export type AddInventoryChoice = 'marketplace' | 'live_show' | 'quick_lot' | 'scan';

const OPTIONS: {
  id: AddInventoryChoice;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'live_show', title: 'From inventory', sub: 'Pull a live-show listing', icon: 'layers-outline' },
  { id: 'marketplace', title: 'Marketplace item', sub: 'Add to collector network', icon: 'storefront-outline' },
  { id: 'quick_lot', title: 'Quick live lot', sub: 'Title-only lane card', icon: 'flash-outline' },
];

export function AddInventoryModal({
  visible,
  quickTitle,
  onChangeQuickTitle,
  onClose,
  onSelect,
  showAuctionPricing,
  pricingBusy,
}: {
  visible: boolean;
  quickTitle: string;
  onChangeQuickTitle: (s: string) => void;
  onClose: () => void;
  onSelect: (id: AddInventoryChoice, pricing?: AuctionPricingValues) => void;
  showAuctionPricing?: boolean;
  pricingBusy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [pricing, setPricing] = useState<AuctionPricingInput>(auctionPricingFromItem({}));

  useEffect(() => {
    if (visible) setPricing(auctionPricingFromItem({}));
  }, [visible]);

  const queueQuickLot = () => {
    if (showAuctionPricing) {
      const v = validateAuctionPricing(pricing);
      if (!v.ok) {
        Alert.alert('Auction pricing', v.message);
        return;
      }
      onSelect('quick_lot', v.values);
      return;
    }
    onSelect('quick_lot');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close add inventory">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title}>Add inventory</Text>
            <Text style={styles.sub}>Queue lots without leaving the lane.</Text>
            {OPTIONS.map((o) => (
              <Pressable
                key={o.id}
                style={styles.row}
                onPress={() => onSelect(o.id)}
                disabled={pricingBusy}
              >
                <View style={styles.iconBubble}>
                  <Ionicons name={o.icon} size={20} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{o.title}</Text>
                  <Text style={styles.rowSub}>{o.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
            <Text style={styles.quickLbl}>Quick lot title</Text>
            <TextInput
              value={quickTitle}
              onChangeText={onChangeQuickTitle}
              placeholder="e.g. PSA 10 rookie chase"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              editable={!pricingBusy}
            />
            {showAuctionPricing ? (
              <AuctionPricingFields value={pricing} onChange={setPricing} disabled={pricingBusy} />
            ) : null}
            <Pressable
              style={[styles.primary, pricingBusy && styles.primaryOff]}
              onPress={queueQuickLot}
              disabled={pricingBusy}
            >
              <Text style={styles.primaryTxt}>{pricingBusy ? 'Adding…' : 'Add quick lot to queue'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    maxHeight: Platform.OS === 'ios' ? '88%' : '92%',
  },
  sheetHeader: { alignItems: 'center', paddingTop: spacing.sm },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.xs,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
    padding: 4,
  },
  scrollContent: { padding: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  quickLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.md,
    padding: 12,
    minHeight: 44,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
});
