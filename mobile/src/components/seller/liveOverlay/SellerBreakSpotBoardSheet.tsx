import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import {
  summarizeVariantSpotBoard,
  formatSoldSpotBuyerLabel,
  type VariantSpotDisplayRow,
} from '../../../lib/liveVariantSpotBoard';
import {
  formatDivisionReelAbbr,
  spotAccentColor,
  teamAbbrForVariant,
  isLightSpotAccent,
} from '../../../lib/liveBreakPresets';
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
  /**
   * Host auction / break board: select a team, enter the buyer's username, mark sold.
   * (Records the sale to that account — does not charge Stripe.)
   */
  canMarkSold?: boolean;
  markSoldBusy?: boolean;
  onMarkSold?: (args: { variantId: string; username: string; label: string }) => void | Promise<void>;
  /** Remove team from board without counting a sale / Show sales amount. */
  onRetireTeam?: (args: { variantId: string; label: string }) => void | Promise<void>;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function teamGridLayout(windowWidth: number, isDivisionBreak: boolean) {
  const sheetPadding = spacing.md * 2;
  const gap = 8;
  const contentWidth = Math.max(280, windowWidth - sheetPadding);
  const columns = isDivisionBreak ? 2 : windowWidth >= 900 ? 5 : 4;
  const maxTileWidth = isDivisionBreak ? 280 : 168;
  const rawWidth = (contentWidth - gap * (columns - 1)) / columns;
  const tileWidth = Math.min(maxTileWidth, rawWidth);
  return { tileWidth, gap, columns };
}

function SpotTile({
  row,
  isDivisionBreak,
  tileWidth,
  compact,
  canPin,
  pinBusy,
  onPinTeam,
  selected,
  canSelect,
  onSelect,
}: {
  row: VariantSpotDisplayRow;
  isDivisionBreak: boolean;
  tileWidth: number;
  compact: boolean;
  canPin: boolean;
  pinBusy: boolean;
  onPinTeam?: (variantId: string) => void;
  selected: boolean;
  canSelect: boolean;
  onSelect?: () => void;
}) {
  const sold = row.sold;
  const pinned = row.isHot && !sold;
  const accent = spotAccentColor(row.label ?? '', row.color, isDivisionBreak);
  const lightAccent = isLightSpotAccent(accent);
  const abbr = isDivisionBreak
    ? formatDivisionReelAbbr(row.label ?? '')
    : teamAbbrForVariant(row.label, row.color);
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
        compact && styles.spotTileCompact,
        { width: tileWidth, borderLeftColor: sold ? 'rgba(255,255,255,0.12)' : accent },
        sold && styles.spotTileSold,
        pinned && styles.spotTilePinned,
        selected && !sold && styles.spotTileSelected,
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

      <View style={[styles.spotTileTop, compact && styles.spotTileTopCompact]}>
        {abbr ? (
          <LiveRoomText style={[styles.spotAbbr, compact && styles.spotAbbrCompact, { color: textPrimary }]}>
            {abbr}
          </LiveRoomText>
        ) : null}
        {isDivisionBreak || !compact || !abbr ? (
          <LiveRoomText
            style={[
              styles.spotLabel,
              isDivisionBreak && styles.spotLabelDivision,
              { color: isDivisionBreak ? textSecondary : textPrimary },
            ]}
            numberOfLines={isDivisionBreak ? 2 : 1}
          >
            {row.label}
          </LiveRoomText>
        ) : null}
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

  if (!canSelect || sold || !onSelect) return body;

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Select ${row.label}`}
    >
      {body}
    </Pressable>
  );
}

export function SellerBreakSpotBoardSheet({
  visible,
  onClose,
  item,
  canPinTeams = false,
  pinningVariantId = null,
  onPinTeam,
  canMarkSold = false,
  markSoldBusy = false,
  onMarkSold,
  onRetireTeam,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [username, setUsername] = useState('');

  const isDivisionBreak = item?.salesFormat === 'team_break';
  const grid = useMemo(
    () => teamGridLayout(windowWidth, Boolean(isDivisionBreak)),
    [windowWidth, isDivisionBreak],
  );

  useEffect(() => {
    if (!visible) {
      setSelectedVariantId(null);
      setUsername('');
    }
  }, [visible]);

  useEffect(() => {
    setSelectedVariantId(null);
    setUsername('');
  }, [item?.id]);

  const board = useMemo(() => {
    if (!item || !isVariantSalesFormat(item.salesFormat)) return null;
    return summarizeVariantSpotBoard(item);
  }, [item]);

  useEffect(() => {
    if (!selectedVariantId || !board) return;
    if (!board.rows.some((r) => r.variantId === selectedVariantId && !r.sold)) {
      setSelectedVariantId(null);
      setUsername('');
    }
  }, [board, selectedVariantId]);

  if (!item || !board || !isVariantSalesFormat(item.salesFormat)) return null;

  const { rows, openCount, soldCount } = board;
  const selectedRow = rows.find((r) => r.variantId === selectedVariantId && !r.sold) ?? null;

  const canSubmit =
    Boolean(canMarkSold && onMarkSold && selectedRow?.variantId && username.trim().replace(/^@+/, '').length >= 3) &&
    !markSoldBusy;

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
                {openCount === 0
                  ? isDivisionBreak
                    ? 'Division roster'
                    : 'Team roster'
                  : isDivisionBreak
                    ? 'Division board'
                    : 'Team board'}
              </LiveRoomText>
              <LiveRoomText style={styles.itemTitle} numberOfLines={2}>
                {item.displayTitle?.trim() || item.title}
              </LiveRoomText>
              <LiveRoomText style={styles.spotsMeta}>
                {openCount === 0
                  ? `Break roster · ${soldCount} teams with buyers`
                  : `${openCount} open · ${soldCount} sold`}
                {openCount === 0
                  ? ' · stays up while you rip'
                  : canMarkSold
                    ? ' · tap a team to mark sold or remove without a sale'
                    : canPinTeams
                      ? ' · use Pin on a team to feature it for buyers'
                      : ''}
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
            keyboardShouldPersistTaps="handled"
          >
            {rows.map((row) => {
              const canPin = Boolean(canPinTeams && onPinTeam && row.variantId && !row.sold);
              const canSelect = Boolean(canMarkSold && onMarkSold && row.variantId && !row.sold);
              return (
                <SpotTile
                  key={row.id}
                  row={row}
                  isDivisionBreak={Boolean(isDivisionBreak)}
                  tileWidth={grid.tileWidth}
                  compact={!isDivisionBreak && grid.columns >= 4}
                  canPin={canPin}
                  pinBusy={Boolean(pinningVariantId)}
                  onPinTeam={onPinTeam}
                  selected={selectedVariantId === row.variantId}
                  canSelect={canSelect}
                  onSelect={
                    canSelect
                      ? () => setSelectedVariantId(row.variantId === selectedVariantId ? null : row.variantId!)
                      : undefined
                  }
                />
              );
            })}
          </ScrollView>

          {canMarkSold && onMarkSold ? (
            <View style={styles.markSoldPanel}>
              <LiveRoomText style={styles.markSoldLabel}>
                {selectedRow ? `Selected · ${selectedRow.label}` : 'Select a team above'}
              </LiveRoomText>
              <TextInput
                style={styles.usernameInput}
                value={username}
                onChangeText={setUsername}
                placeholder="@buyer_username"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                autoCorrect={false}
                editable={Boolean(selectedRow) && !markSoldBusy}
                returnKeyType="done"
              />
              <Pressable
                style={[styles.markSoldBtn, !canSubmit && styles.markSoldBtnOff]}
                disabled={!canSubmit}
                onPress={() => {
                  if (!selectedRow?.variantId || !canSubmit) return;
                  void onMarkSold({
                    variantId: selectedRow.variantId,
                    username: username.trim(),
                    label: selectedRow.label,
                  });
                }}
              >
                {markSoldBusy ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <LiveRoomText style={styles.markSoldBtnTxt}>Mark sold</LiveRoomText>
                )}
              </Pressable>
              {onRetireTeam ? (
                <Pressable
                  style={[styles.retireBtn, (!selectedRow || markSoldBusy) && styles.markSoldBtnOff]}
                  disabled={!selectedRow || markSoldBusy}
                  onPress={() => {
                    if (!selectedRow?.variantId || markSoldBusy) return;
                    void onRetireTeam({
                      variantId: selectedRow.variantId,
                      label: selectedRow.label,
                    });
                  }}
                >
                  <LiveRoomText style={styles.retireBtnTxt}>Remove from board</LiveRoomText>
                </Pressable>
              ) : null}
              {onRetireTeam ? (
                <LiveRoomText style={styles.retireHint}>
                  Remove takes the team off without counting a sale or Show sales amount.
                </LiveRoomText>
              ) : null}
            </View>
          ) : null}
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
  },
  sheetGlow: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerCopy: { flex: 1, gap: 4 },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  spotsMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.48)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridScroll: { flexGrow: 0, maxHeight: 420 },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.sm,
  },
  spotTile: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 64,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  spotTileCompact: { minHeight: 56, paddingVertical: 6 },
  spotTileSold: { opacity: 0.72 },
  spotTilePinned: {
    borderColor: colors.gold,
  },
  spotTileSelected: {
    borderColor: colors.gold,
    borderWidth: 2,
    borderLeftWidth: 3,
  },
  pinnedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.18)',
  },
  pinnedBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
    color: colors.gold,
  },
  hotBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  hotBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
  },
  spotTileTop: { gap: 2, paddingRight: 28 },
  spotTileTopCompact: { paddingRight: 4 },
  spotAbbr: { fontSize: 15, fontWeight: '900' },
  spotAbbrCompact: { fontSize: 13 },
  spotLabel: { fontSize: 10, fontWeight: '700' },
  spotLabelDivision: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  buyerTag: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(52,211,153,0.9)',
  },
  spotFooter: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  priceTag: { fontSize: 11, fontWeight: '800' },
  pinActionBtn: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pinActionBtnActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.18)',
  },
  pinActionBtnText: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  pinActionBtnTextActive: { color: colors.gold },
  markSoldPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: spacing.sm,
    gap: 8,
  },
  markSoldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
  },
  usernameInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  markSoldBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSoldBtnOff: { opacity: 0.45 },
  markSoldBtnTxt: { fontWeight: '900', color: '#111', fontSize: 15 },
  retireBtn: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retireBtnTxt: { fontWeight: '700', color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  retireHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});
