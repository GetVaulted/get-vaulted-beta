import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveItemVariantSnapshot } from '../../api/liveRoomBuyerRepository';
import { purchaseLiveItemVariant } from '../../api/liveVariantPurchaseRepository';
import { isWalletIncompleteError } from '../../lib/buyerWalletErrors';
import { variantIsAvailable, type LiveItemSalesFormat } from '../../lib/liveItemVariant';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  itemId: string;
  title: string;
  imageUrl?: string | null;
  salesFormat: LiveItemSalesFormat;
  variants: LiveItemVariantSnapshot[];
  accessToken?: string;
  walletReady: boolean;
  onWalletRequired: () => void;
  onPurchased: () => void;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LiveVariantSelectionSheet({
  visible,
  onClose,
  roomId,
  itemId,
  title,
  salesFormat,
  variants,
  accessToken,
  walletReady,
  onWalletRequired,
  onPurchased,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? null;

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      setQuantity(1);
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  useEffect(() => {
    setQuantity(1);
  }, [selectedId]);

  const total = useMemo(() => {
    if (!selected) return 0;
    return Math.round(selected.priceUsd * quantity * 100) / 100;
  }, [quantity, selected]);

  const sheetTitle = salesFormat === 'team_break' ? 'Select your team' : 'Select your spot';

  const checkout = async () => {
    if (!selected) {
      setError('Select an option first.');
      return;
    }
    if (!variantIsAvailable(selected)) {
      setError('That option is sold out.');
      return;
    }
    if (!accessToken?.trim()) {
      setError('Sign in to checkout.');
      return;
    }
    if (!walletReady) {
      onWalletRequired();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await purchaseLiveItemVariant({
        accessToken,
        liveRoomId: roomId,
        itemId,
        variantId: selected.id,
        quantity,
      });
      if (!res.ok) {
        setError(res.paymentFailed ? `${res.error} Spot was not sold.` : res.error);
        return;
      }
      if (res.paid) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onPurchased();
        onClose();
        return;
      }
      if (res.requiresAction) {
        setError('Complete payment verification in your Wallet, then try again.');
        return;
      }
      if (res.processing) {
        setError('Payment processing — pull to refresh the room.');
        return;
      }
      setError('Purchase could not complete.');
    } catch (e) {
      if (isWalletIncompleteError(e)) {
        onWalletRequired();
        return;
      }
      setError(e instanceof Error ? e.message : 'Checkout failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handle} />
          <LiveRoomText style={styles.sheetTitle}>{sheetTitle}</LiveRoomText>
          <LiveRoomText style={styles.itemTitle} numberOfLines={2}>
            {title}
          </LiveRoomText>
          <LiveRoomText style={styles.sheetHint}>Pick an available option below</LiveRoomText>

          <ScrollView
            style={styles.chipScroll}
            contentContainerStyle={styles.chipWrap}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {variants.map((v) => (
              <VariantChip
                key={v.id}
                variant={v}
                selected={selectedId === v.id}
                onSelect={() => setSelectedId(v.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.qtyRow}>
            <LiveRoomText style={styles.qtyLabel}>Quantity</LiveRoomText>
            <View style={styles.qtyControl}>
              <Pressable
                style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
                disabled={quantity <= 1}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <LiveRoomText style={styles.qtyBtnText}>−</LiveRoomText>
              </Pressable>
              <LiveRoomText style={styles.qtyValue}>{quantity}</LiveRoomText>
              <Pressable
                style={[styles.qtyBtn, (!selected || quantity >= selected.quantityRemaining) && styles.qtyBtnDisabled]}
                disabled={!selected || quantity >= selected.quantityRemaining}
                onPress={() => setQuantity((q) => q + 1)}
              >
                <LiveRoomText style={styles.qtyBtnText}>+</LiveRoomText>
              </Pressable>
            </View>
          </View>

          <LiveRoomText style={styles.total}>{selected ? fmtMoney(total) : '—'}</LiveRoomText>
          {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}

          <Pressable
            style={[styles.checkoutBtn, (busy || !selected) && styles.checkoutBtnDisabled]}
            disabled={busy || !selected}
            onPress={() => void checkout()}
          >
            {busy ? (
              <ActivityIndicator color="#111" />
            ) : (
              <LiveRoomText style={styles.checkoutText}>Confirm purchase</LiveRoomText>
            )}
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function VariantChip({
  variant,
  selected,
  onSelect,
}: {
  variant: LiveItemVariantSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  const soldOut = !variantIsAvailable(variant);
  return (
    <Pressable
      style={[
        styles.chip,
        soldOut && styles.chipSoldOut,
        selected && !soldOut && styles.chipSelected,
      ]}
      disabled={soldOut}
      onPress={onSelect}
    >
      <LiveRoomText style={[styles.chipLabel, soldOut && styles.chipLabelSoldOut]} numberOfLines={2}>
        {variant.label}
        {variant.isHot ? ' 🔥' : ''}
        {!soldOut ? ` · ${fmtMoney(variant.priceUsd)}` : ''}
      </LiveRoomText>
      {soldOut ? (
        <LiveRoomText style={styles.chipSoldMeta}>
          Sold{variant.buyerUsername ? ` · @${variant.buyerUsername}` : ''}
        </LiveRoomText>
      ) : variant.quantityRemaining > 1 ? (
        <LiveRoomText style={styles.chipQtyMeta}>{variant.quantityRemaining} left</LiveRoomText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#0a0a0e',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,80,0.18)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '82%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  itemTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  sheetHint: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  chipScroll: {
    marginTop: spacing.md,
    maxHeight: 220,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: spacing.sm,
  },
  chip: {
    minWidth: '46%',
    flexGrow: 1,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: 'rgba(255,215,80,0.45)',
    backgroundColor: 'rgba(255,190,40,0.12)',
  },
  chipSoldOut: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    opacity: 0.72,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  chipLabelSoldOut: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.45)',
  },
  chipSoldMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  chipQtyMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  qtyRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.35,
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  qtyValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  total: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  error: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    color: '#fca5a5',
  },
  checkoutBtn: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  checkoutBtnDisabled: {
    opacity: 0.45,
  },
  checkoutText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#111',
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
