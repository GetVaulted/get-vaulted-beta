import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  formatUnavailableSpotLabel,
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
import { UsernameMentionPicker } from '../../mentions/UsernameMentionPicker';

type SaleMode = 'cash' | 'supp';

type Props = {
  visible: boolean;
  onClose: () => void;
  item: LiveRoomItemRow | null;
  accessToken?: string;
  /** When true, host can tap an open team to pin it for buyers. */
  canPinTeams?: boolean;
  pinningVariantId?: string | null;
  onPinTeam?: (variantId: string) => void;
  /**
   * Host auction / break board: select a team, enter buyer + off-platform settlement details, mark sold.
   * (Does not charge the buyer on Stripe — seller pays platform fee separately when amount > $0.)
   */
  canMarkSold?: boolean;
  markSoldBusy?: boolean;
  onMarkSold?: (args: {
    variantId: string;
    username: string;
    label: string;
    priceUsd: number;
    settlementMethod: string;
    zeroReason?: string;
    note?: string;
    /** When true, restore unavailable team first then record the off-platform sale (supp). */
    restoreIfUnavailable?: boolean;
  }) => void | Promise<void>;
  /** Mark team unavailable on the board without counting a sale / Show sales amount. */
  onRetireTeam?: (args: { variantId: string; label: string }) => void | Promise<void>;
  /** Bring an unavailable team back so it can sell again (e.g. late supp). */
  onRestoreTeam?: (args: { variantId: string; label: string }) => void | Promise<void>;
};

const SETTLEMENT_METHODS: { id: string; label: string }[] = [
  { id: 'venmo', label: 'Venmo' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'cash_app', label: 'Cash App' },
  { id: 'cash', label: 'Cash' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'other', label: 'Other' },
];

const ZERO_REASONS: { id: string; label: string }[] = [
  { id: 'giveaway', label: 'Giveaway' },
  { id: 'comp', label: 'Comp' },
  { id: 'mistake', label: 'Mistake' },
  { id: 'other', label: 'Other' },
];

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
  const unavailable = row.unavailable;
  const closed = sold || unavailable;
  const pinned = row.isHot && !closed;
  const accent = spotAccentColor(row.label ?? '', row.color, isDivisionBreak);
  const lightAccent = isLightSpotAccent(accent);
  const abbr = isDivisionBreak
    ? formatDivisionReelAbbr(row.label ?? '')
    : teamAbbrForVariant(row.label, row.color);
  const textPrimary = closed ? 'rgba(255,255,255,0.42)' : lightAccent ? '#111' : '#fff';
  const textSecondary = closed
    ? 'rgba(255,255,255,0.28)'
    : lightAccent
      ? 'rgba(0,0,0,0.62)'
      : 'rgba(255,255,255,0.72)';

  const body = (
    <View
      style={[
        styles.spotTile,
        compact && styles.spotTileCompact,
        { width: tileWidth, borderLeftColor: closed ? 'rgba(255,255,255,0.12)' : accent },
        sold && styles.spotTileSold,
        unavailable && styles.spotTileUnavailable,
        pinned && styles.spotTilePinned,
        selected && !sold && styles.spotTileSelected,
        !closed && { backgroundColor: lightAccent ? `${accent}ee` : `${accent}33` },
      ]}
    >
      {pinned ? (
        <View style={styles.pinnedBadge}>
          <LiveRoomText style={styles.pinnedBadgeText}>PINNED</LiveRoomText>
        </View>
      ) : row.isHot && !closed ? (
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
      ) : unavailable ? (
        <LiveRoomText style={styles.unavailableTag} numberOfLines={1}>
          {formatUnavailableSpotLabel()}
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
      accessibilityLabel={
        unavailable ? `Select unavailable ${row.label} for supp` : `Select ${row.label}`
      }
    >
      {body}
    </Pressable>
  );
}

export function SellerBreakSpotBoardSheet({
  visible,
  onClose,
  item,
  accessToken,
  canPinTeams = false,
  pinningVariantId = null,
  onPinTeam,
  canMarkSold = false,
  markSoldBusy = false,
  onMarkSold,
  onRetireTeam,
  onRestoreTeam,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [amountText, setAmountText] = useState('');
  const [settlementMethod, setSettlementMethod] = useState<string | null>(null);
  const [zeroReason, setZeroReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saleMode, setSaleMode] = useState<SaleMode>('cash');

  const isDivisionBreak = item?.salesFormat === 'team_break';
  const grid = useMemo(
    () => teamGridLayout(windowWidth, Boolean(isDivisionBreak)),
    [windowWidth, isDivisionBreak],
  );

  const resetMarkSoldForm = (prefillAmount?: number | null, mode: SaleMode = 'cash') => {
    setUsername('');
    setSettlementMethod(null);
    setZeroReason(null);
    setNote('');
    setSaleMode(mode);
    setAmountText(
      typeof prefillAmount === 'number' && Number.isFinite(prefillAmount) && prefillAmount >= 0
        ? String(prefillAmount)
        : '',
    );
  };

  useEffect(() => {
    if (!visible) {
      setSelectedVariantId(null);
      resetMarkSoldForm();
    }
  }, [visible]);

  useEffect(() => {
    setSelectedVariantId(null);
    resetMarkSoldForm();
  }, [item?.id]);

  const board = useMemo(() => {
    if (!item || !isVariantSalesFormat(item.salesFormat)) return null;
    return summarizeVariantSpotBoard(item);
  }, [item]);

  useEffect(() => {
    if (!selectedVariantId || !board) return;
    if (!board.rows.some((r) => r.variantId === selectedVariantId && !r.sold)) {
      setSelectedVariantId(null);
      resetMarkSoldForm();
    }
  }, [board, selectedVariantId]);

  if (!item || !board || !isVariantSalesFormat(item.salesFormat)) return null;

  const { rows, openCount, soldCount, unavailableCount } = board;
  const selectedRow = rows.find((r) => r.variantId === selectedVariantId && !r.sold) ?? null;
  const selectedUnavailable = Boolean(selectedRow?.unavailable);
  const isSuppSale = selectedUnavailable || saleMode === 'supp';
  const buyerUsername = username.trim().replace(/^@+/, '');
  const canSubmitUsername = buyerUsername.length >= 3;

  const parsedAmount = (() => {
    if (isSuppSale) return 0;
    const raw = amountText.trim().replace(/[^0-9.]/g, '');
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  })();
  const isZeroSale = parsedAmount != null && parsedAmount < 0.01;
  const canSubmit =
    Boolean(
      canMarkSold &&
        onMarkSold &&
        selectedRow?.variantId &&
        canSubmitUsername &&
        (isSuppSale || (settlementMethod && parsedAmount != null && (!isZeroSale || zeroReason))),
    ) && !markSoldBusy;

  const dismissKeyboard = () => Keyboard.dismiss();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            dismissKeyboard();
            onClose();
          }}
          accessibilityLabel="Close team board"
        />
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
                  ? `Break roster · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ''}`
                  : `${openCount} open · ${soldCount} sold${
                      unavailableCount ? ` · ${unavailableCount} unavailable` : ''
                    }`}
                {canMarkSold
                  ? ' · tap a team for Mark sold, Supp sold, or Mark unavailable'
                  : canPinTeams
                    ? ' · use Pin on a team to feature it for buyers'
                    : ''}
              </LiveRoomText>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={() => {
                dismissKeyboard();
                onClose();
              }}
              hitSlop={10}
            >
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={[styles.gridContent, { gap: grid.gap }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={dismissKeyboard}
          >
            {rows.map((row) => {
              const canPin = Boolean(canPinTeams && onPinTeam && row.variantId && !row.sold && !row.unavailable);
              const canSelect = Boolean(
                canMarkSold &&
                  row.variantId &&
                  !row.sold &&
                  (row.unavailable ? onRestoreTeam || onMarkSold : onMarkSold),
              );
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
                      ? () => {
                          dismissKeyboard();
                          if (row.variantId === selectedVariantId) {
                            setSelectedVariantId(null);
                            resetMarkSoldForm();
                            return;
                          }
                          setSelectedVariantId(row.variantId!);
                          resetMarkSoldForm(row.priceUsd, row.unavailable ? 'supp' : 'cash');
                        }
                      : undefined
                  }
                />
              );
            })}
          </ScrollView>

          {canMarkSold && onMarkSold ? (
            <View style={styles.markSoldPanel}>
              <LiveRoomText style={styles.markSoldLabel}>
                {selectedRow
                  ? isSuppSale
                    ? `Supp sold · ${selectedRow.label}`
                    : `Mark sold · ${selectedRow.label}`
                  : 'Select a team above'}
              </LiveRoomText>
              {selectedRow && !selectedUnavailable ? (
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, saleMode === 'cash' && styles.chipOn, markSoldBusy && styles.markSoldBtnOff]}
                    disabled={markSoldBusy}
                    onPress={() => {
                      dismissKeyboard();
                      setSaleMode('cash');
                    }}
                  >
                    <LiveRoomText style={[styles.chipTxt, saleMode === 'cash' && styles.chipTxtOn]}>
                      Cash / Venmo
                    </LiveRoomText>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, saleMode === 'supp' && styles.chipOn, markSoldBusy && styles.markSoldBtnOff]}
                    disabled={markSoldBusy}
                    onPress={() => {
                      dismissKeyboard();
                      setSaleMode('supp');
                    }}
                  >
                    <LiveRoomText style={[styles.chipTxt, saleMode === 'supp' && styles.chipTxtOn]}>
                      Supp sold
                    </LiveRoomText>
                  </Pressable>
                </View>
              ) : null}
              {isSuppSale ? (
                <LiveRoomText style={styles.fieldHint}>
                  Supp is already paid — pick the buyer. Logs as $0 (no platform fee).
                </LiveRoomText>
              ) : null}
              <UsernameMentionPicker
                value={username}
                onChangeText={setUsername}
                accessToken={accessToken}
                plainUsernameSearch
                dismissKeyboardOnSelect
                onSelectUser={(user) => setUsername(user.username)}
                placeholder="@buyer_username"
                editable={Boolean(selectedRow) && !markSoldBusy}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={dismissKeyboard}
                style={styles.usernameInput}
              />
              <LiveRoomText style={styles.fieldHint}>
                Type a username and tap a match, or Done to dismiss the keyboard.
              </LiveRoomText>
              {!isSuppSale ? (
                <>
                  <TextInput
                    style={styles.usernameInput}
                    value={amountText}
                    onChangeText={setAmountText}
                    placeholder="Amount paid ($0 = free/comp)"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="decimal-pad"
                    editable={Boolean(selectedRow) && !markSoldBusy}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={dismissKeyboard}
                  />
                  <LiveRoomText style={styles.fieldHint}>How did they pay you?</LiveRoomText>
                  <View style={styles.chipRow}>
                    {SETTLEMENT_METHODS.map((m) => {
                      const on = settlementMethod === m.id;
                      return (
                        <Pressable
                          key={m.id}
                          style={[styles.chip, on && styles.chipOn, (!selectedRow || markSoldBusy) && styles.markSoldBtnOff]}
                          disabled={!selectedRow || markSoldBusy}
                          onPress={() => {
                            dismissKeyboard();
                            setSettlementMethod(m.id);
                          }}
                        >
                          <LiveRoomText style={[styles.chipTxt, on && styles.chipTxtOn]}>{m.label}</LiveRoomText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {isZeroSale ? (
                    <>
                      <LiveRoomText style={styles.fieldHint}>Why is this $0?</LiveRoomText>
                      <View style={styles.chipRow}>
                        {ZERO_REASONS.map((r) => {
                          const on = zeroReason === r.id;
                          return (
                            <Pressable
                              key={r.id}
                              style={[styles.chip, on && styles.chipOn, markSoldBusy && styles.markSoldBtnOff]}
                              disabled={markSoldBusy}
                              onPress={() => {
                                dismissKeyboard();
                                setZeroReason(r.id);
                              }}
                            >
                              <LiveRoomText style={[styles.chipTxt, on && styles.chipTxtOn]}>{r.label}</LiveRoomText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}
              <TextInput
                style={styles.usernameInput}
                value={note}
                onChangeText={setNote}
                placeholder="Optional note"
                placeholderTextColor="rgba(255,255,255,0.35)"
                editable={Boolean(selectedRow) && !markSoldBusy}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={dismissKeyboard}
              />
              {!isSuppSale && !isZeroSale && parsedAmount != null ? (
                <LiveRoomText style={styles.feeHint}>
                  You’ll owe Get Vaulted the live platform fee on {fmtMoney(parsedAmount)} after marking sold.
                </LiveRoomText>
              ) : null}
              <Pressable
                style={[styles.markSoldBtn, !canSubmit && styles.markSoldBtnOff]}
                disabled={!canSubmit}
                onPress={() => {
                  if (!selectedRow?.variantId || !canSubmit) return;
                  dismissKeyboard();
                  if (isSuppSale) {
                    void onMarkSold({
                      variantId: selectedRow.variantId,
                      username: buyerUsername,
                      label: selectedRow.label,
                      priceUsd: 0,
                      settlementMethod: 'other',
                      zeroReason: 'other',
                      note: note.trim() || 'Supp purchase',
                      ...(selectedUnavailable ? { restoreIfUnavailable: true } : {}),
                    });
                    return;
                  }
                  if (parsedAmount == null || !settlementMethod) return;
                  void onMarkSold({
                    variantId: selectedRow.variantId,
                    username: buyerUsername,
                    label: selectedRow.label,
                    priceUsd: parsedAmount,
                    settlementMethod,
                    ...(isZeroSale && zeroReason ? { zeroReason } : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  });
                }}
              >
                {markSoldBusy ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <LiveRoomText style={styles.markSoldBtnTxt}>
                    {isSuppSale ? 'Supp sold' : 'Mark sold'}
                  </LiveRoomText>
                )}
              </Pressable>
              {selectedUnavailable && onRestoreTeam ? (
                <Pressable
                  style={[styles.retireBtn, markSoldBusy && styles.markSoldBtnOff]}
                  disabled={markSoldBusy}
                  onPress={() => {
                    if (!selectedRow?.variantId || markSoldBusy) return;
                    dismissKeyboard();
                    void onRestoreTeam({
                      variantId: selectedRow.variantId,
                      label: selectedRow.label,
                    });
                  }}
                >
                  <LiveRoomText style={styles.retireBtnTxt}>Bring back (no sale yet)</LiveRoomText>
                </Pressable>
              ) : null}
              {!selectedUnavailable && onRetireTeam ? (
                <Pressable
                  style={[styles.retireBtn, (!selectedRow || markSoldBusy) && styles.markSoldBtnOff]}
                  disabled={!selectedRow || markSoldBusy}
                  onPress={() => {
                    if (!selectedRow?.variantId || markSoldBusy) return;
                    dismissKeyboard();
                    void onRetireTeam({
                      variantId: selectedRow.variantId,
                      label: selectedRow.label,
                    });
                  }}
                >
                  <LiveRoomText style={styles.retireBtnTxt}>Mark unavailable</LiveRoomText>
                </Pressable>
              ) : null}
              {isSuppSale ? (
                <LiveRoomText style={styles.retireHint}>
                  Supp sold assigns the buyer at $0 (supp already paid).
                  {selectedUnavailable ? ' Bring back alone re-opens the team with no sale.' : ''}
                </LiveRoomText>
              ) : onRetireTeam ? (
                <LiveRoomText style={styles.retireHint}>
                  Mark unavailable keeps the team on the board with no sale. Use Supp sold when the buyer already paid
                  into that team.
                </LiveRoomText>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
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
  spotTileUnavailable: {
    opacity: 0.62,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
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
  unavailableTag: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
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
    zIndex: 40,
    elevation: 8,
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
  fieldHint: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.18)',
  },
  chipTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  chipTxtOn: { color: colors.gold },
  feeHint: {
    fontSize: 11,
    color: 'rgba(212,175,55,0.85)',
    textAlign: 'center',
  },
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
