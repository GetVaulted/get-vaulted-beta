import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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
import {
  isLightSpotAccent,
  spotAccentColor,
  teamAbbrForVariant,
} from '../../lib/liveBreakPresets';
import { variantIsAvailable, type LiveItemSalesFormat } from '../../lib/liveItemVariant';
import { colors, radii, spacing } from '../../theme';
import { HoldToBidButton } from './HoldToBidButton';
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

export function LiveBreakSpotGridSheet({
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
  const isDivisionBreak = salesFormat === 'team_break';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableVariants = useMemo(
    () =>
      variants
        .filter(variantIsAvailable)
        .sort((a, b) => {
          if (a.isHot !== b.isHot) return a.isHot ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        }),
    [variants],
  );

  const soldCount = variants.length - availableVariants.length;
  const selected = availableVariants.find((v) => v.id === selectedId) ?? null;

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      setError(null);
      setBusy(false);
      return;
    }
    if (selectedId && !availableVariants.some((v) => v.id === selectedId)) {
      setSelectedId(null);
    }
  }, [availableVariants, selectedId, visible]);

  const sheetTitle = isDivisionBreak ? 'Pick Your Division' : 'Pick Your Team';
  const allSold = availableVariants.length === 0 && variants.length > 0;

  const checkout = async () => {
    if (!selected) {
      setError('Select a spot first.');
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
        quantity: 1,
      });
      if (!res.ok) {
        setError(res.paymentFailed ? `${res.error} Spot was not sold.` : res.error);
        return;
      }
      if ('paid' in res) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onPurchased();
        setSelectedId(null);
        if (availableVariants.length <= 1) {
          onClose();
        }
        return;
      }
      if ('requiresAction' in res) {
        setError('Complete payment verification in your Wallet, then try again.');
        return;
      }
      if ('processing' in res) {
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
          <LinearGradient
            colors={['rgba(212,175,55,0.14)', 'rgba(10,10,14,0)']}
            style={styles.sheetGlow}
            pointerEvents="none"
          />
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <LiveRoomText style={styles.sheetTitle}>{sheetTitle}</LiveRoomText>
              <LiveRoomText style={styles.itemTitle} numberOfLines={2}>
                {title}
              </LiveRoomText>
              <LiveRoomText style={styles.spotsMeta}>
                {allSold
                  ? 'Break full — all spots sold'
                  : `${availableVariants.length} open · ${soldCount} sold`}
              </LiveRoomText>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={[
              styles.gridContent,
              isDivisionBreak ? styles.gridContentDivision : styles.gridContentTeams,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {availableVariants.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-done-circle" size={42} color={colors.gold} />
                <LiveRoomText style={styles.emptyTitle}>Break is full</LiveRoomText>
                <LiveRoomText style={styles.emptySub}>
                  Every {isDivisionBreak ? 'division' : 'team'} has been claimed. Watch for the break to start.
                </LiveRoomText>
              </View>
            ) : (
              availableVariants.map((variant) => (
                <SpotCell
                  key={variant.id}
                  variant={variant}
                  isDivision={isDivisionBreak}
                  selected={selectedId === variant.id}
                  onSelect={() => {
                    void Haptics.selectionAsync().catch(() => {});
                    setSelectedId(variant.id);
                    setError(null);
                  }}
                />
              ))
            )}
          </ScrollView>

          {selected ? (
            <View style={styles.checkoutBar}>
              <View style={styles.checkoutMeta}>
                <LiveRoomText style={styles.checkoutLabel}>Selected</LiveRoomText>
                <LiveRoomText style={styles.checkoutSpot} numberOfLines={1}>
                  {selected.label}
                </LiveRoomText>
                <LiveRoomText style={styles.checkoutPrice}>{fmtMoney(selected.priceUsd)}</LiveRoomText>
              </View>
              <View style={styles.holdWrap}>
                <HoldToBidButton
                  label={busy ? 'Processing…' : `Hold to buy · ${fmtMoney(selected.priceUsd)}`}
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
                  onCommit={() => void checkout()}
                  variant="gold"
                />
              </View>
            </View>
          ) : (
            <LiveRoomText style={styles.selectHint}>
              Tap {isDivisionBreak ? 'a division' : 'a team'}, then hold to buy
            </LiveRoomText>
          )}

          {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}
        </View>
      </View>
    </Modal>
  );
}

function SpotCell({
  variant,
  isDivision,
  selected,
  onSelect,
}: {
  variant: LiveItemVariantSnapshot;
  isDivision: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = spotAccentColor(variant.label, variant.color, isDivision);
  const lightText = isLightSpotAccent(accent);
  const abbr = !isDivision ? teamAbbrForVariant(variant.label, variant.color) : null;
  const conference = isDivision ? (variant.color === 'NFC' ? 'NFC' : 'AFC') : null;

  return (
    <Pressable
      style={[
        styles.spotCell,
        isDivision ? styles.spotCellDivision : styles.spotCellTeam,
        selected && styles.spotCellSelected,
      ]}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <LinearGradient
        colors={[accent, `${accent}CC`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spotGradient}
      >
        {conference ? (
          <LiveRoomText style={[styles.conferenceBadge, lightText && styles.spotTextDark]}>
            {conference}
          </LiveRoomText>
        ) : null}
        {variant.isHot ? (
          <View style={styles.pinBadge} pointerEvents="none">
            <Ionicons name="pin" size={10} color={colors.gold} />
          </View>
        ) : null}
        {abbr ? (
          <LiveRoomText style={[styles.spotAbbr, lightText && styles.spotTextDark]}>{abbr}</LiveRoomText>
        ) : null}
        <LiveRoomText
          style={[isDivision ? styles.spotDivisionLabel : styles.spotTeamLabel, lightText && styles.spotTextDark]}
          numberOfLines={isDivision ? 2 : 1}
        >
          {variant.label}
        </LiveRoomText>
        <LiveRoomText style={[styles.spotPrice, lightText && styles.spotTextDarkMuted]}>
          {fmtMoney(variant.priceUsd)}
        </LiveRoomText>
      </LinearGradient>
      {selected ? <View style={styles.spotSelectedRing} pointerEvents="none" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    backgroundColor: '#07070b',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,80,0.22)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  sheetGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerCopy: { flex: 1 },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  itemTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  spotsMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.48)',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridScroll: {
    marginTop: spacing.md,
    maxHeight: '58%',
  },
  gridContent: {
    paddingBottom: spacing.sm,
  },
  gridContentTeams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridContentDivision: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spotCell: {
    borderRadius: radii.md,
    overflow: 'hidden',
    position: 'relative',
  },
  spotCellTeam: {
    width: '23%',
    minWidth: 74,
    flexGrow: 1,
    aspectRatio: 0.92,
  },
  spotCellDivision: {
    width: '47%',
    minHeight: 92,
    flexGrow: 1,
  },
  spotCellSelected: {
    transform: [{ scale: 0.98 }],
  },
  spotGradient: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'flex-end',
    minHeight: 72,
  },
  spotSelectedRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  conferenceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.82)',
  },
  pinBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  spotAbbr: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#fff',
  },
  spotTeamLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  spotDivisionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 18,
  },
  spotPrice: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    fontVariant: ['tabular-nums'],
  },
  spotTextDark: { color: '#111' },
  spotTextDarkMuted: { color: 'rgba(17,17,17,0.72)' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: 8,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  emptySub: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.55)',
    paddingHorizontal: spacing.lg,
  },
  checkoutBar: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,80,0.22)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  checkoutMeta: {
    alignItems: 'center',
    gap: 2,
  },
  checkoutLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
  },
  checkoutSpot: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
  },
  checkoutPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  holdWrap: {
    minHeight: 48,
  },
  selectHint: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: '#fca5a5',
  },
});
