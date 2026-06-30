import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import { buildVariantSpotDisplayRows, formatSoldSpotBuyerLabel, type VariantSpotDisplayRow } from '../../../lib/liveVariantSpotBoard';
import { spotAccentColor, teamAbbrForVariant, isLightSpotAccent } from '../../../lib/liveBreakPresets';
import { colors, radii, spacing } from '../../../theme';
import { LiveRoomText } from '../../live/LiveRoomText';

type Props = {
  visible: boolean;
  onClose: () => void;
  item: LiveRoomItemRow | null;
  /** When true, host can tap an open team to pin it for buyers. */
  canPinTeams?: boolean;
  pinningVariantId?: string | null;
  onPinTeam?: (variantId: string) => void;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function teamGridLayout(windowWidth: number, isDivisionBreak: boolean) {
  const sheetPadding = spacing.md * 2;
  const gap = 8;
  const contentWidth = Math.max(280, windowWidth - sheetPadding);
  const columns = isDivisionBreak ? 2 : windowWidth >= 900 ? 5 : windowWidth >= 680 ? 4 : windowWidth >= 420 ? 3 : 2;
  const maxTileWidth = isDivisionBreak ? 280 : 168;
  const rawWidth = (contentWidth - gap * (columns - 1)) / columns;
  const tileWidth = Math.min(maxTileWidth, rawWidth);
  return { tileWidth, gap, columns };
}

function SpotTile({
  row,
  isDivisionBreak,
  tileWidth,
  canPin,
  pinBusy,
  onPinTeam,
}: {
  row: VariantSpotDisplayRow;
  isDivisionBreak: boolean;
  tileWidth: number;
  canPin: boolean;
  pinBusy: boolean;
  onPinTeam?: (variantId: string) => void;
}) {
  const sold = row.sold;
  const pinned = row.isHot && !sold;
  const accent = spotAccentColor(row.label ?? '', row.color, isDivisionBreak);
  const lightAccent = isLightSpotAccent(accent);
  const abbr = teamAbbrForVariant(row.label, row.color);
  const textPrimary = sold ? 'rgba(255,255,255,0.42)' : lightAccent ? '#111' : '#fff';
  const textSecondary = sold
    ? 'rgba(255,255,255,0.28)'
    : lightAccent
      ? 'rgba(0,0,0,0.62)'
      : 'rgba(255,255,255,0.72)';

  const body = (
    <View
      style={[
        styles.spotTile,
        { width: tileWidth, borderLeftColor: sold ? 'rgba(255,255,255,0.12)' : accent },
        sold && styles.spotTileSold,
        pinned && styles.spotTilePinned,
        !sold && { backgroundColor: lightAccent ? `${accent}ee` : `${accent}33` },
      ]}
    >
      {pinned ? (
        <View style={styles.pinnedBadge}>
          <LiveRoomText style={styles.pinnedBadgeText}>PINNED</LiveRoomText>
        </View>
      ) : row.isHot && !sold ? (
        <View style={styles.hotBadge}>
          <LiveRoomText style={styles.hotBadgeText}>HOT</LiveRoomText>
        </View>
      ) : null}

      <View style={styles.spotTileTop}>
        {abbr && !isDivisionBreak ? (
          <LiveRoomText style={[styles.spotAbbr, { color: textPrimary }]}>{abbr}</LiveRoomText>
        ) : null}
        <LiveRoomText
          style={[styles.spotLabel, { color: textPrimary }, isDivisionBreak && styles.spotLabelDivision]}
          numberOfLines={isDivisionBreak ? 2 : 1}
        >
          {row.label}
        </LiveRoomText>
      </View>

      {sold ? (
        <LiveRoomText style={styles.buyerTag} numberOfLines={1}>
          {formatSoldSpotBuyerLabel(row.buyerUsername)}
        </LiveRoomText>
      ) : (
        <View style={styles.spotFooter}>
          <LiveRoomText style={[styles.priceTag, { color: textSecondary }]}>{fmtMoney(row.priceUsd)}</LiveRoomText>
          {canPin && row.variantId ? (
            <Pressable
              style={[styles.pinActionBtn, pinned && styles.pinActionBtnActive]}
              onPress={() => onPinTeam?.(row.variantId!)}
              disabled={pinBusy}
              accessibilityLabel={`Pin ${row.label} for buyers`}
            >
              <LiveRoomText style={[styles.pinActionBtnText, pinned && styles.pinActionBtnTextActive]}>
                {pinned ? 'Pinned' : 'Pin'}
              </LiveRoomText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  return body;
}

export function SellerBreakSpotBoardSheet({
  visible,
  onClose,
  item,
  canPinTeams = false,
  pinningVariantId = null,
  onPinTeam,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const isDivisionBreak = item?.salesFormat === 'team_break';
  const grid = useMemo(
    () => teamGridLayout(windowWidth, Boolean(isDivisionBreak)),
    [windowWidth, isDivisionBreak],
  );

  if (!item || !isVariantSalesFormat(item.salesFormat)) return null;

  const rows = buildVariantSpotDisplayRows(item);
  const soldCount = rows.filter((r) => r.sold).length;
  const openCount = rows.length - soldCount;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close team board" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <LinearGradient
            colors={['rgba(212,175,55,0.14)', 'rgba(10,10,14,0)']}
            style={styles.sheetGlow}
            pointerEvents="none"
          />
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <LiveRoomText style={styles.sheetTitle}>
                {isDivisionBreak ? 'Division board' : 'Team board'}
              </LiveRoomText>
              <LiveRoomText style={styles.itemTitle} numberOfLines={2}>
                {item.displayTitle?.trim() || item.title}
              </LiveRoomText>
              <LiveRoomText style={styles.spotsMeta}>
                {openCount} open · {soldCount} sold
                {canPinTeams ? ' · use Pin on a team to feature it for buyers' : ''}
              </LiveRoomText>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={[styles.gridContent, { gap: grid.gap }]}
            showsVerticalScrollIndicator={false}
          >
            {rows.map((row) => {
              const canPin = Boolean(canPinTeams && onPinTeam && row.variantId && !row.sold);
              return (
                <SpotTile
                  key={row.id}
                  row={row}
                  isDivisionBreak={isDivisionBreak}
                  tileWidth={grid.tileWidth}
                  canPin={canPin}
                  pinBusy={Boolean(pinningVariantId)}
                  onPinTeam={onPinTeam}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0a0a0e',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
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
    flexGrow: 0,
    marginTop: spacing.md,
    maxHeight: 520,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.lg,
  },
  spotTile: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 84,
    justifyContent: 'space-between',
  },
  spotTileSold: {
    opacity: 0.72,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderStyle: 'dashed',
  },
  spotTilePinned: {
    borderColor: colors.gold,
    borderWidth: 1.5,
    borderLeftWidth: 4,
  },
  spotTilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  spotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  pinActionBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pinActionBtnActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.18)',
  },
  pinActionBtnText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.82)',
  },
  pinActionBtnTextActive: {
    color: colors.gold,
  },
  spotTileTop: {
    gap: 2,
    paddingRight: 28,
  },
  pinnedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pinnedBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#111',
    letterSpacing: 0.4,
  },
  hotBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(220,38,38,0.92)',
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hotBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.4,
  },
  spotAbbr: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  spotLabel: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  spotLabelDivision: {
    fontSize: 13,
    lineHeight: 17,
  },
  buyerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
  },
  priceTag: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
