import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveConfirmPayment } from './LiveStripeProvider';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveItemVariantSnapshot } from '../../api/liveRoomBuyerRepository';
import { fetchLiveBuyerPaymentSession } from '../../api/liveBuyerPaymentRepository';
import {
  fetchLiveVariantCheckoutPreview,
  type LiveVariantCheckoutPreview,
} from '../../api/liveVariantCheckoutPreviewRepository';
import {
  purchaseLiveItemVariant,
  purchaseLiveItemVariantBatch,
  syncLiveItemVariantPurchase,
  syncLiveItemVariantPurchaseBatch,
} from '../../api/liveVariantPurchaseRepository';
import { isWalletIncompleteError } from '../../lib/buyerWalletErrors';
import { mapLivePaymentFailureMessage } from '../../lib/livePaymentFailureCopy';
import { withLivePlaybackCommerceHold } from '../../lib/livePlaybackCommerceHold';
import { formatSoldSpotBuyerLabel, formatUnavailableSpotLabel } from '../../lib/liveVariantSpotBoard';
import {
  isLightSpotAccent,
  spotAccentColor,
} from '../../lib/liveBreakPresets';
import {
  sortVariantsForBuyerDisplay,
  summarizeVariantSpots,
  variantIsAvailable,
  variantSelectSpotLabel,
  isRandomVariantAssignment,
  evaluateFreshVariantsForCheckout,
  evaluateFreshVariantsForBatchCheckout,
  type LiveItemSalesFormat,
  type RefreshVariantsResult,
} from '../../lib/liveItemVariant';
import { radii, spacing } from '../../theme';
import { vaultColors } from '../../theme/vaultColors';
import { vaultFonts } from '../../theme/vaultTypography';
import {
  buildLocalVariantPurchaseCelebration,
  formatBatchSpotCelebrationLabel,
  type LiveSpotTakenCelebration,
} from '../../lib/liveSpotCelebration';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { SlideToBidButton } from './SlideToBidButton';
import { LiveRoomText } from './LiveRoomText';

/**
 * Buyer checkout bottom sheet for PYT (variant_selection) and PYD (team_break).
 * Open spots use this sheet for purchase. Once the break fills, buyers open the same
 * host team roster (`SellerBreakSpotBoardSheet`) via Team roster / Teams — not this sheet.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  itemId: string;
  title: string;
  imageUrl?: string | null;
  salesFormat: LiveItemSalesFormat;
  variantAssignmentMode?: 'pick' | 'random' | 'draft';
  variants: LiveItemVariantSnapshot[];
  /** Hide teams currently in spot auction (buyers bid on those instead). */
  excludeVariantIds?: string[];
  /** Pre-select a team/division when opening checkout (host-pinned spot). */
  initialVariantId?: string | null;
  accessToken?: string;
  walletReady: boolean;
  onWalletRequired: () => void;
  onPurchased: () => void;
  /** Immediate buyer/seller celebration — do not wait on realtime. */
  onSpotCelebration?: (celebration: LiveSpotTakenCelebration) => void;
  viewerUsername?: string | null;
  /** Refetch room snapshot after failed checkout so released spots reappear. */
  onRoomRefresh?: () => void | Promise<void>;
  /**
   * Pull fresh server-authoritative variant availability for this item, immediately before
   * charging (pick-mode only). Must resolve to a discriminated result rather than a bare
   * nullable array so checkout can tell "the active lot changed" apart from "the refresh
   * request failed" — both abort the charge, but with different messaging (see
   * `evaluateFreshVariantsForCheckout`).
   */
  onRefreshVariants?: () => Promise<RefreshVariantsResult>;
  /** HUD may already have loaded this — reuse while the sheet refetches for the selected spot. */
  seedCheckoutPreview?: LiveVariantCheckoutPreview | null;
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
  onSpotCelebration,
  viewerUsername,
  onRoomRefresh,
  onRefreshVariants,
  seedCheckoutPreview = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const confirmPayment = useLiveConfirmPayment();
  const isDivisionBreak = salesFormat === 'team_break';
  const isPlayerBreak = salesFormat === 'player_selection';
  const spotNoun = isDivisionBreak ? 'divisions' : isPlayerBreak ? 'players' : 'teams';
  const spotNounSingular = isDivisionBreak ? 'division' : isPlayerBreak ? 'player' : 'team';
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<LiveVariantCheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [spotSearch, setSpotSearch] = useState('');
  // FIX 3: synchronous in-flight guard — a React state update (`busy`) is not immediate, so a
  // second hold-to-commit within the same render cycle could otherwise start a second checkout.
  const checkoutInFlightRef = useRef(false);

  const isRandom = isRandomVariantAssignment(variantAssignmentMode);
  const pickerVariants = useMemo(() => {
    const exclude = new Set(excludeVariantIds ?? []);
    return variants.filter((v) => !exclude.has(v.id));
  }, [excludeVariantIds, variants]);
  const sortedVariants = useMemo(() => sortVariantsForBuyerDisplay(pickerVariants), [pickerVariants]);
  const showSpotSearch = !isRandom && isPlayerBreak && sortedVariants.length > 12;
  const filteredVariants = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return sortedVariants;
    return sortedVariants.filter((v) => v.label.toLowerCase().includes(q));
  }, [spotSearch, sortedVariants]);
  const spotSummary = useMemo(() => summarizeVariantSpots(pickerVariants), [pickerVariants]);
  const selectedVariants = useMemo(
    () => sortedVariants.filter((v) => selectedIds.includes(v.id)),
    [selectedIds, sortedVariants],
  );
  const selected = selectedVariants[0] ?? null;
  const selectionCount = selectedVariants.length;
  const pickerBaseLabel = variantSelectSpotLabel(salesFormat, isRandom);

  const unitPrice = selected?.priceUsd ?? spotSummary.fromPriceUsd ?? 0;

  const spotPrice = useMemo(() => {
    if (selectedVariants.length === 0) return 0;
    return Math.round(selectedVariants.reduce((sum, v) => sum + v.priceUsd, 0) * 100) / 100;
  }, [selectedVariants]);

  // FIX 4: a seed is only trustworthy when it was computed for THIS item — matching price alone
  // isn't enough (two different items can coincidentally share a spot price). A seed missing an
  // item id at all is treated as untrustworthy and ignored so a fresh preview is fetched instead.
  const seedMatchesActiveItem = Boolean(
    seedCheckoutPreview &&
      seedCheckoutPreview.liveRoomItemId &&
      seedCheckoutPreview.liveRoomItemId === itemId &&
      Math.abs(seedCheckoutPreview.itemPriceUsd - spotPrice) < 0.01,
  );

  const effectivePreview =
    checkoutPreview ?? (seedMatchesActiveItem ? seedCheckoutPreview : null);

  const totalDue = effectivePreview?.chargeNowUsd ?? spotPrice;
  const chargeNow = totalDue;

  const shippingSummaryValue = !walletReady
    ? 'Add shipping in Vault Wallet'
    : effectivePreview
      ? effectivePreview.shippingDisplay
      : previewLoading
        ? 'Calculating…'
        : '—';

  const taxSummaryValue = !walletReady
    ? 'Add address to estimate'
    : effectivePreview?.taxDisplay
      ? effectivePreview.taxDisplay
      : previewLoading
        ? 'Calculating…'
        : 'Included when you hold to buy';

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      setError(null);
      setBusy(false);
      checkoutInFlightRef.current = false;
      setCheckoutPreview(null);
      setPreviewLoading(false);
      setSpotSearch('');
      return;
    }
    if (isRandom) {
      const available = sortedVariants.find((v) => variantIsAvailable(v));
      if (available) setSelectedIds([available.id]);
      return;
    }
    if (
      initialVariantId &&
      selectedIds.length === 0 &&
      sortedVariants.some((v) => v.id === initialVariantId && variantIsAvailable(v))
    ) {
      setSelectedIds([initialVariantId]);
      return;
    }
    setSelectedIds((prev) => {
      const next = prev.filter((id) => sortedVariants.some((v) => v.id === id && variantIsAvailable(v)));
      return next.length === prev.length ? prev : next;
    });
  }, [initialVariantId, isRandom, sortedVariants, visible]);

  const toggleSpot = (variantId: string) => {
    if (isRandom) return;
    setSelectedIds((prev) => {
      if (prev.includes(variantId)) return prev.filter((id) => id !== variantId);
      return [...prev, variantId];
    });
    setError(null);
  };

  useEffect(() => {
    if (!visible || !walletReady || !accessToken?.trim() || spotPrice <= 0) {
      setCheckoutPreview(null);
      setPreviewLoading(false);
      return;
    }

    if (seedMatchesActiveItem && seedCheckoutPreview) {
      setCheckoutPreview(seedCheckoutPreview);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const loadPreview = () => {
      if (cancelled) return;
      setPreviewLoading(true);
      void fetchLiveVariantCheckoutPreview(accessToken, {
        liveRoomId: roomId,
        itemId,
        itemPriceUsd: spotPrice,
      })
        .then((preview) => {
          if (cancelled) return;
          if (preview) {
            setCheckoutPreview(preview);
            setPreviewLoading(false);
            return;
          }
          attempt += 1;
          if (attempt < 4) {
            retryTimer = setTimeout(loadPreview, Math.min(6000, 1200 * attempt));
            return;
          }
          setPreviewLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          attempt += 1;
          if (attempt < 4) {
            retryTimer = setTimeout(loadPreview, Math.min(6000, 1200 * attempt));
            return;
          }
          setPreviewLoading(false);
        });
    };

    setCheckoutPreview(null);
    loadPreview();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [accessToken, itemId, roomId, seedCheckoutPreview, seedMatchesActiveItem, spotPrice, visible, walletReady]);

  const pickerTitle =
    selectionCount === 0
      ? pickerBaseLabel
      : selectionCount === 1
        ? `${pickerBaseLabel}: ${selectedVariants[0]!.label}`
        : `${pickerBaseLabel}: ${selectionCount} selected`;

  const allSold = spotSummary.available <= 0 && pickerVariants.length > 0;

  const finishSuccessfulPurchase = (spotLabel: string, amountUsd: number) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBusy(false);
    setError(null);
    setSelectedIds([]);
    onClose();
    onPurchased();
    if (isRandom || !onSpotCelebration) return;
    const celebration = buildLocalVariantPurchaseCelebration({
      viewerUsername,
      label: spotLabel,
      amountUsd,
    });
    setTimeout(() => {
      onSpotCelebration(celebration);
    }, 420);
  };

  const checkout = async () => {
    // FIX 3: synchronous guard checked before any async work — `busy` is a React state update
    // and is not guaranteed to have re-rendered yet when a second hold-to-commit fires.
    if (checkoutInFlightRef.current) return;
    if (selectedVariants.length === 0) {
      setError(`Select ${isDivisionBreak ? 'a division' : 'a team'} first.`);
      return;
    }
    if (selectedVariants.some((v) => !variantIsAvailable(v))) {
      setError('One or more spots were just taken. Update your selection.');
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
    checkoutInFlightRef.current = true;
    setBusy(true);
    setError(null);
    const useBatch = !isRandom && selectedVariants.length >= 2;
    const celebrationLabel = useBatch
      ? formatBatchSpotCelebrationLabel(selectedVariants.map((v) => v.label))
      : selectedVariants[0]!.label;
    const chargeFallback = spotPrice;
    try {
      if (!isRandom && onRefreshVariants) {
        let result: RefreshVariantsResult;
        try {
          result = await onRefreshVariants();
        } catch {
          result = { status: 'fetch_failed' };
        }
        const decision = useBatch
          ? evaluateFreshVariantsForBatchCheckout(
              result,
              selectedVariants.map((v) => v.id),
            )
          : evaluateFreshVariantsForCheckout(result, selectedVariants[0]!.id);
        if (!decision.proceed) {
          setError(decision.message);
          if (useBatch) {
            /* keep selection so buyer can deselect sold spots */
          } else {
            setSelectedIds([]);
          }
          if (decision.closeSheet) onClose();
          return;
        }
      }
      const paymentSession = accessToken?.trim()
        ? await fetchLiveBuyerPaymentSession(accessToken, roomId)
        : null;
      const paymentMethodId = paymentSession?.activePaymentMethodId ?? undefined;

      const res = useBatch
        ? await purchaseLiveItemVariantBatch({
            accessToken,
            liveRoomId: roomId,
            itemId,
            variantIds: selectedVariants.map((v) => v.id),
            paymentMethodId,
          })
        : await purchaseLiveItemVariant({
            accessToken,
            liveRoomId: roomId,
            itemId,
            variantId: selectedVariants[0]!.id,
            quantity: 1,
            paymentMethodId,
          });

      const syncPurchase = async (purchaseRes: typeof res) => {
        if (!('purchaseId' in purchaseRes) && !('batchId' in purchaseRes)) return purchaseRes;
        if (useBatch && purchaseRes.ok && 'batchId' in purchaseRes && purchaseRes.batchId) {
          return syncLiveItemVariantPurchaseBatch({
            accessToken,
            liveRoomId: roomId,
            itemId,
            batchId: purchaseRes.batchId,
          });
        }
        if (purchaseRes.ok && 'purchaseId' in purchaseRes && purchaseRes.purchaseId) {
          return syncLiveItemVariantPurchase({
            accessToken,
            liveRoomId: roomId,
            itemId,
            variantId: selectedVariants[0]!.id,
            purchaseId: purchaseRes.purchaseId,
          });
        }
        return purchaseRes;
      };

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
        finishSuccessfulPurchase(
          res.labels?.length ? formatBatchSpotCelebrationLabel(res.labels) : celebrationLabel,
          checkoutPreview?.chargeNowUsd ?? chargeFallback,
        );
        return;
      }
      if ('requiresAction' in res) {
        if (!confirmPayment) {
          const msg = 'Payments are still starting up — try again in a moment.';
          setError(msg);
          onClose();
          Alert.alert('Payment loading', msg);
          return;
        }
        const conf = await withLivePlaybackCommerceHold(() =>
          confirmPayment(res.clientSecret, { paymentMethodType: 'Card' }),
        );
        if (conf.error) {
          const msg = mapLivePaymentFailureMessage(conf.error.message, conf.error.code);
          setError(msg);
          onClose();
          Alert.alert('Payment failed', msg);
          const synced = await syncPurchase(res);
          if (!synced.ok && synced.paymentFailed) await onRoomRefresh?.();
          return;
        }
        const synced = await syncPurchase(res);
        if (synced.ok && 'paid' in synced) {
          finishSuccessfulPurchase(celebrationLabel, checkoutPreview?.chargeNowUsd ?? chargeFallback);
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
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await new Promise((r) => setTimeout(r, 800 + attempt * 400));
          const synced = await syncPurchase(res);
          if (synced.ok && 'paid' in synced) {
            finishSuccessfulPurchase(celebrationLabel, checkoutPreview?.chargeNowUsd ?? chargeFallback);
            return;
          }
          if (!synced.ok && synced.paymentFailed) {
            setError(
              mapLivePaymentFailureMessage(synced.error, synced.code) + ' Spot was not sold.',
            );
            onClose();
            Alert.alert(
              'Payment failed',
              mapLivePaymentFailureMessage(synced.error, synced.code) + ' Spot was not sold.',
            );
            await onRoomRefresh?.();
            return;
          }
        }
        setError('Payment processing — pull to refresh the room, or check My orders → Live shows.');
        return;
      }
      setError('Purchase could not complete.');
      onRoomRefresh?.();
    } catch (e) {
      if (isWalletIncompleteError(e)) {
        onWalletRequired();
        return;
      }
      setError(
        mapLivePaymentFailureMessage(e instanceof Error ? e.message : null) ||
          (e instanceof Error ? e.message : 'Checkout failed.'),
      );
    } finally {
      checkoutInFlightRef.current = false;
      setBusy(false);
    }
  };

  const onCheckoutPress = () => {
    void checkout();
  };

  const rosterMode = allSold;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Android renders <Modal> in its own native window, outside the app-root
          GestureHandlerRootView — without a root here, react-native-gesture-handler gestures
          (the Slide-to-buy Pan) never receive touches. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close checkout" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <LiveRoomText style={styles.checkoutHeading}>
                {rosterMode ? (isDivisionBreak ? 'Division roster' : 'Team roster') : 'Checkout'}
              </LiveRoomText>
              {rosterMode ? (
                <LiveRoomText style={styles.securityLine}>
                  All spots sold · see who got each {isDivisionBreak ? 'division' : 'team'}
                </LiveRoomText>
              ) : (
                <View style={styles.securityRow}>
                  <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.42)" />
                  <LiveRoomText style={styles.securityLine}>Secure checkout · encrypted by Stripe</LiveRoomText>
                </View>
              )}
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
                {!rosterMode ? (
                  <LiveRoomText style={styles.productPrice}>{fmtMoney(unitPrice)}</LiveRoomText>
                ) : null}
                <View style={styles.remainingPillWrap}>
                  <LiveRoomText style={styles.remainingMeta}>
                    {rosterMode
                      ? `Break in progress · ${pickerVariants.length} ${isDivisionBreak ? 'divisions' : 'teams'}`
                      : `${spotSummary.available} spot${spotSummary.available === 1 ? '' : 's'} remaining`}
                  </LiveRoomText>
                </View>
              </View>
            </View>

            <View style={styles.pickerSection}>
              <LiveRoomText style={styles.pickerTitle}>
                {rosterMode
                  ? isDivisionBreak
                    ? 'Who got each division'
                    : isPlayerBreak
                      ? 'Who got each player'
                      : 'Who got each team'
                  : pickerTitle}
              </LiveRoomText>
              <LiveRoomText style={styles.pickerHint}>
                {rosterMode
                  ? `Sold roster — stays available while the host runs the break`
                  : isRandom
                    ? 'Slide to buy — Vault Reveal assigns your spot from what’s left'
                    : selectionCount > 0
                      ? walletReady
                        ? selectionCount > 1
                          ? `Slide to buy to pay ${fmtMoney(chargeNow)} for ${selectionCount} spots — shipping and tax below`
                          : `Slide to buy to pay ${fmtMoney(chargeNow)} now — spot, shipping, and tax below`
                        : `Confirm ${spotNounSingular}, then slide to buy to checkout`
                      : `Tap ${spotNoun} to multi-select, then checkout`}
              </LiveRoomText>
              {isRandom && !rosterMode ? (
                <View style={styles.randomRevealCard}>
                  <LiveRoomText style={styles.randomRevealKicker}>Vault Reveal</LiveRoomText>
                  <LiveRoomText style={styles.randomRevealBody}>
                    {spotSummary.available} {spotNoun} left in the pool
                  </LiveRoomText>
                </View>
              ) : (
                <>
                  {showSpotSearch && !rosterMode ? (
                    <TextInput
                      value={spotSearch}
                      onChangeText={setSpotSearch}
                      placeholder="Search players…"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.spotSearch}
                      autoCorrect={false}
                      autoCapitalize="none"
                      clearButtonMode="while-editing"
                    />
                  ) : null}
                  <View style={styles.pillWrap}>
                    {filteredVariants.map((variant) => (
                      <TeamPill
                        key={variant.id}
                        variant={variant}
                        selected={!rosterMode && selectedIds.includes(variant.id)}
                        wide={isDivisionBreak || isPlayerBreak}
                        onSelect={() => {
                          if (rosterMode || !variantIsAvailable(variant)) return;
                          void Haptics.selectionAsync().catch(() => {});
                          toggleSpot(variant.id);
                        }}
                      />
                    ))}
                  </View>
                  {showSpotSearch && !rosterMode && filteredVariants.length === 0 ? (
                    <LiveRoomText style={styles.pickerHint}>No players match that search.</LiveRoomText>
                  ) : null}
                </>
              )}
            </View>

            {!rosterMode ? (
              <>
                <View style={styles.summaryCard}>
                  <SummaryRow
                    icon="pricetag-outline"
                    label={selectionCount > 1 ? `Spot prices (${selectionCount})` : 'Spot price'}
                    value={selectionCount > 0 ? fmtMoney(spotPrice) : '—'}
                  />
                  <SummaryRow
                    icon="cube-outline"
                    label="Shipping"
                    value={shippingSummaryValue}
                  />
                  <SummaryRow
                    icon="receipt-outline"
                    label="Taxes"
                    value={taxSummaryValue}
                  />
                </View>
                {effectivePreview?.taxNote ? (
                  <LiveRoomText style={styles.previewNote}>{effectivePreview.taxNote}</LiveRoomText>
                ) : null}
              </>
            ) : null}

            {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}
          </ScrollView>

          {!rosterMode ? (
          <View style={styles.stickyBar}>
            <View style={styles.totalCol}>
              <LiveRoomText style={styles.totalLabel}>Total due</LiveRoomText>
              <LiveRoomText style={styles.totalValue}>
                {selectionCount > 0 ? fmtMoney(totalDue) : '—'}
              </LiveRoomText>
            </View>
            <View style={styles.payCol}>
              <SlideToBidButton
                label={
                  selectionCount > 0
                    ? isRandom
                      ? `Slide to buy · vault reveal · ${fmtMoney(chargeNow)}`
                      : selectionCount > 1
                        ? `Slide to buy · ${selectionCount} spots · ${fmtMoney(chargeNow)}`
                        : `Slide to buy · ${fmtMoney(chargeNow)}`
                    : isRandom
                      ? 'Slide to buy'
                      : 'Select spots'
                }
                disabled={selectionCount === 0 || allSold}
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
                variant="auction"
              />
            </View>
          </View>
          ) : (
            <View style={styles.stickyBar}>
              <Pressable style={styles.rosterDoneBtn} onPress={onClose} accessibilityRole="button">
                <LiveRoomText style={styles.rosterDoneTxt}>Done</LiveRoomText>
              </Pressable>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
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

/** First letter of the first two words, or first two characters — the crest badge glyph on division/player cards. */
function spotInitials(label: string): string {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function TeamPill({
  variant,
  selected,
  wide = false,
  onSelect,
}: {
  variant: LiveItemVariantSnapshot;
  selected: boolean;
  /** Divisions/players use the 2-column crest card; teams use the 4-column tile. */
  wide?: boolean;
  onSelect: () => void;
}) {
  const soldOut = !variantIsAvailable(variant);
  // Same accent pattern as host `SellerBreakSpotBoardSheet` / setup grid — team board colors must match.
  const accent = spotAccentColor(variant.label ?? '', variant.color, wide);
  const lightAccent = isLightSpotAccent(accent);
  const textPrimary = soldOut ? 'rgba(255,255,255,0.42)' : lightAccent ? '#111' : '#fff';
  const textSecondary = soldOut
    ? 'rgba(255,255,255,0.28)'
    : lightAccent
      ? 'rgba(0,0,0,0.62)'
      : 'rgba(255,255,255,0.72)';
  const showPinned = variant.isHot && !soldOut;
  const showCheck = selected && !soldOut;

  const pinnedBadge = showPinned ? (
    <View style={styles.foilRibbon} pointerEvents="none">
      <LinearGradient
        colors={LIVE_CLAIM_CTA_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.foilRibbonFill}
      >
        <LiveRoomText style={styles.foilRibbonText}>Pinned</LiveRoomText>
      </LinearGradient>
    </View>
  ) : null;

  const checkBadge = showCheck ? (
    <View style={styles.checkBadge} pointerEvents="none">
      <LiveRoomText style={styles.checkBadgeText}>{'\u2713'}</LiveRoomText>
    </View>
  ) : null;

  if (wide) {
    // Division/player card: crest badge + name/price — replaces the old oversized capsule pill.
    return (
      <Pressable
        style={[
          styles.wideCard,
          !soldOut && {
            borderColor: selected ? vaultColors.gold : 'rgba(255,255,255,0.1)',
            borderWidth: selected ? 1.5 : 1,
          },
          soldOut && styles.pillSold,
          selected && !soldOut && styles.pillSelectedGlow,
        ]}
        disabled={soldOut}
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: soldOut }}
      >
        {pinnedBadge}
        {checkBadge}
        <View
          style={[
            styles.crest,
            {
              backgroundColor: soldOut ? 'rgba(255,255,255,0.05)' : lightAccent ? `${accent}ee` : `${accent}40`,
              borderColor: soldOut ? 'rgba(255,255,255,0.1)' : accent,
            },
          ]}
        >
          <LiveRoomText style={[styles.crestText, { color: soldOut ? 'rgba(255,255,255,0.35)' : textPrimary }]}>
            {spotInitials(variant.label)}
          </LiveRoomText>
        </View>
        <View style={styles.wideCopy}>
          <LiveRoomText
            style={[styles.pillLabel, soldOut && styles.pillLabelSold, selected && !soldOut && styles.pillLabelSelected]}
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
              {variant.status === 'removed'
                ? formatUnavailableSpotLabel()
                : formatSoldSpotBuyerLabel(variant.buyerUsername)}
            </LiveRoomText>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[
        styles.pill,
        styles.pillTeam,
        !soldOut && {
          backgroundColor: lightAccent ? `${accent}ee` : `${accent}33`,
          borderLeftWidth: 3,
          borderLeftColor: accent,
          borderColor: selected ? vaultColors.gold : 'rgba(255,255,255,0.16)',
          borderWidth: selected ? 1.5 : 1,
        },
        soldOut && styles.pillSold,
        selected && !soldOut && styles.pillSelectedGlow,
      ]}
      disabled={soldOut}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: soldOut }}
    >
      {pinnedBadge}
      {checkBadge}
      <LiveRoomText
        style={[
          styles.pillLabel,
          { color: textPrimary },
          soldOut && styles.pillLabelSold,
          selected && !soldOut && styles.pillLabelSelected,
        ]}
        numberOfLines={1}
      >
        {variant.label}
      </LiveRoomText>
      {!soldOut ? (
        <LiveRoomText style={[styles.pillPrice, { color: textSecondary }, selected && styles.pillPriceSelected]}>
          {fmtMoney(variant.priceUsd)}
        </LiveRoomText>
      ) : (
        <LiveRoomText style={styles.pillSoldMeta} numberOfLines={1}>
          {variant.status === 'removed'
            ? formatUnavailableSpotLabel()
            : formatSoldSpotBuyerLabel(variant.buyerUsername)}
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
    borderColor: 'rgba(203,163,92,0.18)',
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
    borderBottomColor: 'rgba(203,163,92,0.16)',
  },
  headerCopy: { flex: 1, gap: 4 },
  checkoutHeading: {
    fontFamily: vaultFonts.display,
    fontSize: 19,
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
    fontFamily: vaultFonts.displayMedium,
    fontSize: 14.5,
    color: '#fff',
    lineHeight: 19,
  },
  productPrice: {
    fontFamily: vaultFonts.display,
    fontSize: 15,
    color: vaultColors.goldBright,
    fontVariant: ['tabular-nums'],
  },
  remainingPillWrap: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(203,163,92,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.28)',
  },
  remainingMeta: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: vaultColors.goldBright,
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
    fontFamily: vaultFonts.display,
    fontSize: 15,
    color: '#fff',
  },
  pickerHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
  },
  spotSearch: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    fontSize: 14,
  },
  randomRevealCard: {
    marginTop: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.25)',
    backgroundColor: 'rgba(203,163,92,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  randomRevealKicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: vaultColors.goldBright,
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    position: 'relative',
  },
  /** 4 columns — matches pinned team board / host Teams sheet. */
  pillTeam: {
    minWidth: 72,
    maxWidth: '23.5%',
    flexGrow: 1,
    flexBasis: '22%',
  },
  /** Division/player card — crest badge + name/price, 2 per row. */
  wideCard: {
    position: 'relative',
    minWidth: 150,
    maxWidth: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  crest: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  crestText: {
    fontFamily: vaultFonts.label,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  wideCopy: {
    flex: 1,
    minWidth: 0,
  },
  pillSelectedGlow: {
    shadowColor: vaultColors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  checkBadge: {
    position: 'absolute',
    top: -6,
    left: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: vaultColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  checkBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#111',
    lineHeight: 10,
  },
  foilRibbon: {
    position: 'absolute',
    top: -6,
    right: 8,
    borderRadius: 999,
    overflow: 'hidden',
    zIndex: 2,
  },
  foilRibbonFill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  foilRibbonText: {
    fontFamily: vaultFonts.labelSemibold,
    fontSize: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#111',
  },
  pillSold: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
    borderLeftColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    opacity: 0.72,
  },
  pillLabel: {
    fontFamily: vaultFonts.label,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pillLabelSelected: {
    fontWeight: '900',
  },
  pillLabelSold: {
    textDecorationLine: 'line-through',
  },
  pillPrice: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pillPriceSelected: {
    color: vaultColors.gold,
    fontWeight: '800',
  },
  pillSoldMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(52,211,153,0.85)',
    letterSpacing: 0.2,
  },
  summaryCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(203,163,92,0.14)',
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
    borderTopColor: 'rgba(203,163,92,0.22)',
    backgroundColor: '#0b0b10',
  },
  rosterDoneBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.35)',
    backgroundColor: 'rgba(203,163,92,0.14)',
  },
  rosterDoneTxt: {
    fontFamily: vaultFonts.label,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: vaultColors.goldBright,
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
    fontFamily: vaultFonts.display,
    fontSize: 22,
    color: vaultColors.emerald,
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
    backgroundColor: vaultColors.gold,
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
