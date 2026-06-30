import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveItemVariantSnapshot } from '../../api/liveRoomBuyerRepository';
import { fetchLiveBuyerPaymentSession } from '../../api/liveBuyerPaymentRepository';
import {
  fetchLiveVariantCheckoutPreview,
  type LiveVariantCheckoutPreview,
} from '../../api/liveVariantCheckoutPreviewRepository';
import {
  purchaseLiveItemVariant,
  syncLiveItemVariantPurchase,
} from '../../api/liveVariantPurchaseRepository';
import { isWalletIncompleteError } from '../../lib/buyerWalletErrors';
import { mapLivePaymentFailureMessage } from '../../lib/livePaymentFailureCopy';
import { formatSoldSpotBuyerLabel } from '../../lib/liveVariantSpotBoard';
import {
  sortVariantsForBuyerDisplay,
  summarizeVariantSpots,
  variantIsAvailable,
  variantSelectSpotLabel,
  isRandomVariantAssignment,
  type LiveItemSalesFormat,
} from '../../lib/liveItemVariant';
import { colors, radii, spacing } from '../../theme';
import { HoldToBidButton } from './HoldToBidButton';
import { LiveRoomText } from './LiveRoomText';

/**
 * Buyer checkout bottom sheet for PYT (variant_selection) and PYD (team_break).
 * This is the only buyer-facing spot picker — do not add a center team board for buyers.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  itemId: string;
  title: string;
  imageUrl?: string | null;
  salesFormat: LiveItemSalesFormat;
  variantAssignmentMode?: 'pick' | 'random';
  variants: LiveItemVariantSnapshot[];
  /** Hide teams currently in spot auction (buyers bid on those instead). */
  excludeVariantIds?: string[];
  /** Pre-select a team/division when opening checkout (host-pinned spot). */
  initialVariantId?: string | null;
  accessToken?: string;
  walletReady: boolean;
  onWalletRequired: () => void;
  onPurchased: () => void;
  /** Refetch room snapshot after failed checkout so released spots reappear. */
  onRoomRefresh?: () => void | Promise<void>;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LiveBreakSpotGridSheet({
  visible,
  onClose,
  roomId,
  itemId,
  title,
  imageUrl,
  salesFormat,
  variantAssignmentMode = 'pick',
  variants,
  excludeVariantIds,
  initialVariantId,
  accessToken,
  walletReady,
  onWalletRequired,
  onPurchased,
  onRoomRefresh,
}: Props) {
  const insets = useSafeAreaInsets();
  const { confirmPayment } = useStripe();
  const isDivisionBreak = salesFormat === 'team_break';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<LiveVariantCheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isRandom = isRandomVariantAssignment(variantAssignmentMode);
  const pickerVariants = useMemo(() => {
    const exclude = new Set(excludeVariantIds ?? []);
    return variants.filter((v) => !exclude.has(v.id));
  }, [excludeVariantIds, variants]);
  const sortedVariants = useMemo(() => sortVariantsForBuyerDisplay(pickerVariants), [pickerVariants]);
  const spotSummary = useMemo(() => summarizeVariantSpots(pickerVariants), [pickerVariants]);
  const selected = sortedVariants.find((v) => v.id === selectedId) ?? null;
  const pickerBaseLabel = variantSelectSpotLabel(salesFormat, isRandom);

  const unitPrice = selected?.priceUsd ?? spotSummary.fromPriceUsd ?? 0;
  const quantity = 1;

  const spotPrice = useMemo(() => {
    if (!selected) return 0;
    return Math.round(selected.priceUsd * quantity * 100) / 100;
  }, [quantity, selected]);

  const totalDue = checkoutPreview?.chargeNowUsd ?? spotPrice;
  const chargeNow = totalDue;

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      setError(null);
      setBusy(false);
      setCheckoutPreview(null);
      setPreviewLoading(false);
      return;
    }
    if (isRandom) {
      const available = sortedVariants.find((v) => variantIsAvailable(v));
      if (available) setSelectedId(available.id);
      return;
    }
    if (
      initialVariantId &&
      sortedVariants.some((v) => v.id === initialVariantId && variantIsAvailable(v))
    ) {
      setSelectedId(initialVariantId);
      return;
    }
    if (selectedId && !sortedVariants.some((v) => v.id === selectedId && variantIsAvailable(v))) {
      setSelectedId(null);
    }
  }, [initialVariantId, isRandom, selectedId, sortedVariants, visible]);

  useEffect(() => {
    if (!visible || !walletReady || !accessToken?.trim() || spotPrice <= 0) {
      setCheckoutPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void fetchLiveVariantCheckoutPreview(accessToken, {
      liveRoomId: roomId,
      itemId,
      itemPriceUsd: spotPrice,
    })
      .then((preview) => {
        if (!cancelled) setCheckoutPreview(preview);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, itemId, roomId, spotPrice, visible, walletReady]);

  const pickerTitle = selected
    ? `${pickerBaseLabel}: ${selected.label}`
    : pickerBaseLabel;

  const allSold = spotSummary.available <= 0 && pickerVariants.length > 0;

  const checkout = async () => {
    if (!selected) {
      setError(`Select ${isDivisionBreak ? 'a division' : 'a team'} first.`);
      return;
    }
    if (!variantIsAvailable(selected)) {
      setError('That spot was just taken. Pick another.');
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
      const paymentSession = accessToken?.trim()
        ? await fetchLiveBuyerPaymentSession(accessToken, roomId)
        : null;
      const res = await purchaseLiveItemVariant({
        accessToken,
        liveRoomId: roomId,
        itemId,
        variantId: selected.id,
        quantity,
        paymentMethodId: paymentSession?.activePaymentMethodId ?? undefined,
      });
      if (!res.ok) {
        const msg =
          mapLivePaymentFailureMessage(res.error, res.code) + (res.paymentFailed ? ' Spot was not sold.' : '');
        console.log('[variant purchase] checkout blocked', {
          code: res.code ?? null,
          status: res.status,
          paymentFailed: res.paymentFailed ?? false,
          checkoutDebug: res.checkoutDebug ?? null,
        });
        setError(msg);
        if (res.paymentFailed || res.code === 'LIVE_PAYMENT_BLOCKED') {
          onClose();
          Alert.alert(
            res.code === 'LIVE_PAYMENT_BLOCKED' ? 'Payment blocked' : 'Payment failed',
            res.code === 'LIVE_PAYMENT_BLOCKED'
              ? `${msg} Use Retry payment on the recovery banner.`
              : msg,
          );
          await onRoomRefresh?.();
        }
        return;
      }
      if ('paid' in res) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onPurchased();
        setSelectedId(null);
        if (spotSummary.available <= quantity) {
          onClose();
        }
        return;
      }
      if ('requiresAction' in res) {
        const conf = await confirmPayment(res.clientSecret, { paymentMethodType: 'Card' });
        if (conf.error) {
          const msg = mapLivePaymentFailureMessage(conf.error.message, conf.error.code);
          setError(msg);
          onClose();
          Alert.alert('Payment failed', msg);
          const synced = await syncLiveItemVariantPurchase({
            accessToken,
            liveRoomId: roomId,
            itemId,
            variantId: selected.id,
            purchaseId: res.purchaseId,
          });
          if (!synced.ok && synced.paymentFailed) await onRoomRefresh?.();
          return;
        }
        const synced = await syncLiveItemVariantPurchase({
          accessToken,
          liveRoomId: roomId,
          itemId,
          variantId: selected.id,
          purchaseId: res.purchaseId,
        });
        if (synced.ok && 'paid' in synced) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onPurchased();
          setSelectedId(null);
          if (spotSummary.available <= quantity) {
            onClose();
          }
          return;
        }
        setError(
          !synced.ok
            ? mapLivePaymentFailureMessage(synced.error, synced.code) +
                (synced.paymentFailed ? ' Spot was not sold.' : '')
            : 'Payment is still processing — pull to refresh the room.',
        );
        if (!synced.ok && synced.paymentFailed) {
          onClose();
          Alert.alert(
            'Payment failed',
            mapLivePaymentFailureMessage(synced.error, synced.code) + ' Spot was not sold.',
          );
          await onRoomRefresh?.();
        }
        return;
      }
      if ('processing' in res) {
        setError('Payment processing — pull to refresh the room.');
        return;
      }
      setError('Purchase could not complete.');
      onRoomRefresh?.();
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

  const onCheckoutPress = () => {
    void checkout();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close checkout" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <LiveRoomText style={styles.checkoutHeading}>Checkout</LiveRoomText>
              <View style={styles.securityRow}>
                <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.42)" />
                <LiveRoomText style={styles.securityLine}>Secure checkout · encrypted by Stripe</LiveRoomText>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.78)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.productRow}>
              <View style={styles.thumbWrap}>
                {imageUrl?.trim() ? (
                  <Image source={{ uri: imageUrl.trim() }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumbFallback}>
                    <LiveRoomText style={styles.thumbFallbackTxt}>{title.slice(0, 1).toUpperCase()}</LiveRoomText>
                  </View>
                )}
              </View>
              <View style={styles.productCopy}>
                <LiveRoomText style={styles.productTitle} numberOfLines={2}>
                  {title}
                </LiveRoomText>
                <LiveRoomText style={styles.productPrice}>{fmtMoney(unitPrice)}</LiveRoomText>
                <LiveRoomText style={styles.remainingMeta}>
                  {allSold
                    ? 'All spots sold'
                    : `${spotSummary.available} spot${spotSummary.available === 1 ? '' : 's'} remaining`}
                </LiveRoomText>
              </View>
            </View>

            <View style={styles.pickerSection}>
              <LiveRoomText style={styles.pickerTitle}>{pickerTitle}</LiveRoomText>
              <LiveRoomText style={styles.pickerHint}>
                {isRandom
                  ? 'Hold to buy — the Vault wheel assigns your team from what’s left'
                  : selected
                    ? `Confirm ${isDivisionBreak ? 'division' : 'team'} and hold to buy — shipping & tax included below`
                    : `Tap ${isDivisionBreak ? 'a division' : 'a team'} to checkout`}
              </LiveRoomText>
              {isRandom ? (
                <View style={styles.randomRevealCard}>
                  <LiveRoomText style={styles.randomRevealKicker}>Vault Reveal</LiveRoomText>
                  <LiveRoomText style={styles.randomRevealBody}>
                    {spotSummary.available} {isDivisionBreak ? 'divisions' : 'teams'} left on the wheel
                  </LiveRoomText>
                </View>
              ) : (
                <View style={styles.pillWrap}>
                  {sortedVariants.map((variant) => (
                    <TeamPill
                      key={variant.id}
                      variant={variant}
                      selected={selectedId === variant.id}
                      onSelect={() => {
                        if (!variantIsAvailable(variant)) return;
                        void Haptics.selectionAsync().catch(() => {});
                        setSelectedId(variant.id);
                        setError(null);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>

            <View style={styles.summaryCard}>
              <SummaryRow
                icon="pricetag-outline"
                label="Spot price"
                value={selected ? fmtMoney(spotPrice) : '—'}
              />
              <SummaryRow
                icon="cube-outline"
                label="Shipping"
                value={
                  !walletReady
                    ? 'Add shipping in Vault Wallet'
                    : previewLoading && !checkoutPreview
                      ? 'Calculating…'
                      : checkoutPreview?.shippingDisplay ?? 'Calculated by destination'
                }
              />
              <SummaryRow
                icon="card-outline"
                label="Payment"
                value={walletReady ? 'Saved card in Vault Wallet' : 'Add a card in Vault Wallet'}
              />
              <SummaryRow
                icon="receipt-outline"
                label="Taxes"
                value={
                  !walletReady
                    ? 'Add address to estimate'
                    : previewLoading && !checkoutPreview
                      ? 'Calculating…'
                      : checkoutPreview?.taxDisplay ?? 'Calculated at checkout'
                }
              />
            </View>
            {checkoutPreview?.taxNote ? (
              <LiveRoomText style={styles.previewNote}>{checkoutPreview.taxNote}</LiveRoomText>
            ) : null}

            {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}
          </ScrollView>

          <View style={styles.stickyBar}>
            <View style={styles.totalCol}>
              <LiveRoomText style={styles.totalLabel}>Total due</LiveRoomText>
              <LiveRoomText style={styles.totalValue}>{selected ? fmtMoney(totalDue) : '—'}</LiveRoomText>
            </View>
            <View style={styles.payCol}>
              <HoldToBidButton
                label={
                  selected
                    ? isRandom
                      ? `Hold to buy · wheel reveal · ${fmtMoney(chargeNow)}`
                      : `Hold to buy · ${fmtMoney(chargeNow)}`
                    : isRandom
                      ? 'Hold to buy'
                      : 'Select a spot'
                }
                disabled={!selected || allSold}
                busy={busy}
                onHoldStart={() => {
                  if (!accessToken?.trim()) {
                    setError('Sign in to checkout.');
                    return false;
                  }
                  if (!walletReady) {
                    onWalletRequired();
                    return false;
                  }
                  return true;
                }}
                onCommit={onCheckoutPress}
                variant="gold"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.38)" />
      <LiveRoomText style={styles.summaryLabel}>{label}</LiveRoomText>
      <LiveRoomText style={styles.summaryValue} numberOfLines={2}>
        {value}
      </LiveRoomText>
    </View>
  );
}

function TeamPill({
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
        styles.pill,
        soldOut && styles.pillSold,
        selected && !soldOut && styles.pillSelected,
      ]}
      disabled={soldOut}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: soldOut }}
    >
      {variant.isHot && !soldOut ? (
        <View style={styles.hotBadge}>
          <LiveRoomText style={styles.hotBadgeText}>Pinned</LiveRoomText>
        </View>
      ) : null}
      <LiveRoomText
        style={[
          styles.pillLabel,
          soldOut && styles.pillLabelSold,
          selected && !soldOut && styles.pillLabelSelected,
        ]}
        numberOfLines={1}
      >
        {variant.label}
      </LiveRoomText>
      {!soldOut ? (
        <LiveRoomText style={[styles.pillPrice, selected && styles.pillPriceSelected]}>
          {fmtMoney(variant.priceUsd)}
        </LiveRoomText>
      ) : (
        <LiveRoomText style={styles.pillSoldMeta} numberOfLines={1}>
          {formatSoldSpotBuyerLabel(variant.buyerUsername)}
        </LiveRoomText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    backgroundColor: '#0b0b10',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    maxHeight: '72%',
    overflow: 'hidden',
    flexDirection: 'column',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerCopy: { flex: 1, gap: 4 },
  checkoutHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  securityLine: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  bodyContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackTxt: {
    fontSize: 22,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.28)',
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 18,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  remainingMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  qtyCol: {
    alignItems: 'center',
    gap: 4,
  },
  qtyLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  qtyBtnDisabled: {
    opacity: 0.35,
  },
  qtyBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  qtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  pickerSection: {
    gap: 6,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  pickerHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
  },
  randomRevealCard: {
    marginTop: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,190,40,0.25)',
    backgroundColor: 'rgba(255,190,40,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  randomRevealKicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,215,120,0.9)',
  },
  randomRevealBody: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    minWidth: 88,
    maxWidth: '48%',
    flexGrow: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
  },
  pillSelected: {
    borderColor: 'rgba(255,215,80,0.55)',
    backgroundColor: 'rgba(255,190,40,0.1)',
  },
  pillSold: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    opacity: 0.72,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  pillLabelSelected: {
    fontWeight: '900',
    color: '#fff',
  },
  pillLabelSold: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.38)',
  },
  pillPrice: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
  },
  pillPriceSelected: {
    color: colors.gold,
    fontWeight: '800',
  },
  pillSoldMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(52,211,153,0.85)',
    letterSpacing: 0.2,
  },
  hotBadge: {
    position: 'absolute',
    top: -6,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hotBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#fff',
  },
  summaryCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    width: 72,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  summaryValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'right',
  },
  previewNote: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
  },
  error: {
    textAlign: 'center',
    fontSize: 12,
    color: '#fca5a5',
  },
  stickyBar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0b0b10',
  },
  totalCol: {
    minWidth: 88,
    gap: 2,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  chargeNowNote: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  payCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  checkoutBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  checkoutBtnDisabled: {
    opacity: 0.45,
  },
  checkoutBtnText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
    color: '#111',
  },
});
