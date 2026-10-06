import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSweet16Draft,
  pickSweet16DraftTeam,
  randomizeSweet16DraftOrder,
  startSweet16Draft,
  Sweet16ApiError,
  type Sweet16BoardTile,
  type Sweet16DraftSnapshot,
} from '../../api/liveSweet16DraftRepository';
import { segmentColorForLabel } from '../../lib/liveBreakPresets';
import {
  SWEET16_URGENT_SECONDS,
  formatUsernameHandle,
  reconcileSweet16Selection,
  sweet16BoardCounts,
  sweet16BoardFromVariants,
  sweet16Countdown,
  sweet16ErrorMessage,
  sweet16IsMyTurn,
  sweet16MyTurnKey,
  sweet16OrderRows,
  sweet16ResultRows,
  sweet16SecondsLeft,
  sweet16SelectableLabels,
} from '../../lib/liveSweet16Draft';
import { colors, radii, spacing, vaultColors } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

/** How often to re-poll draft state while the sheet is open. Server is authoritative either way. */
const POLL_MS = 3000;
const GRID_COLUMNS = 4;
const GRID_GAP = 6;

type BoardVariantInput = {
  label: string;
  color?: string | null;
  quantityRemaining?: number | null;
  status?: string | null;
  buyerUsername?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  itemId: string;
  title: string;
  accessToken?: string;
  /** Host version: also shows the two-step controls ("Randomize order", then "Start draft"). */
  isHost?: boolean;
  /** Fired once when the draft transitions to complete, while this sheet is open. */
  onDraftComplete?: () => void;
  /** Bump to refetch immediately (parent wires realtime `sweet16_draft_*` events to this). */
  refreshSignal?: number;
  /** Latest snapshot the parent already has — shown instantly instead of a spinner. */
  seedDraft?: Sweet16DraftSnapshot | null;
  /** Every snapshot this sheet fetches/receives, so the parent's watcher stays in sync. */
  onDraftChange?: (draft: Sweet16DraftSnapshot | null) => void;
  /** The item's own variants — used to draw the 32-team board before a draft snapshot exists. */
  variants?: BoardVariantInput[];
};

/**
 * Sweet 16 Break — buyers and host share this sheet. 32 teams are on the board; once 16 sell, the
 * host randomizes the draft order, then starts the draft, and each buyer in turn picks one of the
 * 16 unsold teams so everyone ends with 2. The server validates turn ownership and the deadline on
 * every action — this sheet's own gating is a nicety, never the real gate.
 */
export function LiveSweet16DraftSheet({
  visible,
  onClose,
  roomId,
  itemId,
  title,
  accessToken,
  isHost = false,
  onDraftComplete,
  refreshSignal = 0,
  seedDraft = null,
  onDraftChange,
  variants,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useState<Sweet16DraftSnapshot | null>(seedDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'randomize' | 'start' | 'pick' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const notifiedCompleteRef = useRef(false);
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  const applyDraft = useCallback((next: Sweet16DraftSnapshot | null) => {
    setDraft(next);
    onDraftChangeRef.current?.(next);
  }, []);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      const next = await fetchSweet16Draft(accessToken ?? '', roomId, itemId);
      // Ignore a slow response that was overtaken by a newer one (poll vs. realtime vs. action).
      if (seq < appliedSeqRef.current) return;
      appliedSeqRef.current = seq;
      applyDraft(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the draft.');
    }
  }, [accessToken, roomId, itemId, applyDraft]);

  /** Apply an action's response so it also outranks any poll that started before it. */
  const applyActionResult = useCallback(
    (next: Sweet16DraftSnapshot) => {
      appliedSeqRef.current = ++requestSeqRef.current;
      applyDraft(next);
      setError(null);
    },
    [applyDraft],
  );

  useEffect(() => {
    if (seedDraft) setDraft((prev) => prev ?? seedDraft);
  }, [seedDraft]);

  useEffect(() => {
    if (!visible) {
      notifiedCompleteRef.current = false;
      return undefined;
    }
    setLoading(true);
    void load().finally(() => setLoading(false));
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [visible, load]);

  // Realtime nudge from the parent: refetch right away instead of waiting for the next poll.
  const lastSignalRef = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === lastSignalRef.current) return;
    lastSignalRef.current = refreshSignal;
    if (visible) void load();
  }, [refreshSignal, visible, load]);

  useEffect(() => {
    if (draft?.status === 'complete' && !notifiedCompleteRef.current) {
      notifiedCompleteRef.current = true;
      onDraftComplete?.();
    }
  }, [draft?.status, onDraftComplete]);

  const isMyTurn = sweet16IsMyTurn(draft);
  const myTurnKey = sweet16MyTurnKey(draft);

  // Buzz once per turn that is mine (a multi-team buyer gets one per turn), so a buyer who is
  // looking at the stream rather than the sheet still notices the clock starting.
  const buzzedTurnRef = useRef<string | null>(null);
  useEffect(() => {
    if (!myTurnKey) {
      buzzedTurnRef.current = null;
      return;
    }
    if (buzzedTurnRef.current === myTurnKey) return;
    buzzedTurnRef.current = myTurnKey;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [myTurnKey]);

  const selectable = useMemo(
    () => (draft && isMyTurn ? sweet16SelectableLabels(draft) : new Set<string>()),
    [draft, isMyTurn],
  );

  // A new turn (or a team that just got taken) clears any stale selection.
  useEffect(() => {
    setSelected((prev) => reconcileSweet16Selection(prev, selectable));
  }, [selectable, myTurnKey]);

  const secondsLeft = draft?.status === 'in_progress' ? sweet16SecondsLeft(draft.currentTurnDeadlineAt, nowMs) : null;
  const urgent = secondsLeft != null && secondsLeft <= SWEET16_URGENT_SECONDS;

  const board: Sweet16BoardTile[] = useMemo(() => {
    if (draft && draft.board.length > 0) return draft.board;
    return sweet16BoardFromVariants(variants);
  }, [draft, variants]);
  const counts = useMemo(() => sweet16BoardCounts(board), [board]);

  const status = draft?.status ?? 'not_started';
  const orderRows = useMemo(() => (draft ? sweet16OrderRows(draft) : []), [draft]);
  const resultRows = useMemo(() => (draft && status === 'complete' ? sweet16ResultRows(draft) : []), [draft, status]);
  const maxSpots = draft?.maxSpots ?? 16;
  const totalPicks = draft?.turnOrder.length ?? maxSpots;
  const madeCount = draft?.picks.length ?? 0;

  const showFriendlyError = (e: unknown, fallback: string) => {
    const code = e instanceof Sweet16ApiError ? e.code : undefined;
    Alert.alert('Sweet 16 Draft', sweet16ErrorMessage(code, e instanceof Error ? e.message : fallback));
  };

  const runRandomize = () => {
    if (busy) return;
    setBusy('randomize');
    void randomizeSweet16DraftOrder(accessToken ?? '', roomId, itemId)
      .then((next) => {
        applyActionResult(next);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      })
      .catch((e) => {
        showFriendlyError(e, 'Could not randomize the order.');
        void load();
      })
      .finally(() => setBusy(null));
  };

  const runStart = () => {
    if (busy) return;
    setBusy('start');
    void startSweet16Draft(accessToken ?? '', roomId, itemId)
      .then((next) => applyActionResult(next))
      .catch((e) => {
        showFriendlyError(e, 'Could not start the draft.');
        void load();
      })
      .finally(() => setBusy(null));
  };

  const confirmPick = () => {
    if (!draft || busy || !selected || !isMyTurn) return;
    const teamLabel = selected;
    setBusy('pick');
    void pickSweet16DraftTeam({ accessToken: accessToken ?? '', roomId, itemId, teamLabel })
      .then((next) => {
        applyActionResult(next);
        setSelected(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      })
      .catch((e) => {
        showFriendlyError(e, 'Could not record your pick.');
        setSelected(null);
        void load();
      })
      .finally(() => setBusy(null));
  };

  const onTilePress = (tile: Sweet16BoardTile) => {
    if (!isMyTurn || busy || !selectable.has(tile.label)) return;
    void Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => (prev === tile.label ? null : tile.label));
  };

  const tileWidth = Math.floor((windowWidth - spacing.md * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const waitingForOrder = status === 'not_started';
  const showFooterRandomize = isHost && waitingForOrder;
  const showFooterStart = isHost && status === 'order_set';
  const showFooterPick = isMyTurn;
  const hasFooter = showFooterRandomize || showFooterStart || showFooterPick;

  const orderSection =
    orderRows.length > 0 && status !== 'complete' ? (
      <View style={styles.section}>
        <LiveRoomText style={styles.sectionHeader}>Draft order</LiveRoomText>
        {orderRows.map((row) => {
          const pick = draft?.picks.find((p) => p.purchaseId === row.purchaseId) ?? null;
          return (
            <View
              key={row.purchaseId}
              style={[styles.orderRow, row.isCurrent && styles.orderRowCurrent, row.isDone && styles.orderRowDone]}
            >
              <View style={[styles.orderNum, row.isCurrent && styles.orderNumCurrent]}>
                <LiveRoomText style={[styles.orderNumTxt, row.isCurrent && styles.orderNumTxtCurrent]}>
                  {row.turnNumber}
                </LiveRoomText>
              </View>
              <View style={styles.orderCopy}>
                <LiveRoomText style={styles.orderName} numberOfLines={1}>
                  {formatUsernameHandle(row.buyerUsername)}
                  {row.isMe ? '  (you)' : ''}
                </LiveRoomText>
                <LiveRoomText style={styles.orderSub} numberOfLines={1}>
                  {row.boughtTeamLabel ? `Bought ${row.boughtTeamLabel}` : 'Bought a team'}
                </LiveRoomText>
              </View>
              {row.isCurrent ? (
                <View style={[styles.countdownPill, urgent && styles.countdownPillUrgent]}>
                  <LiveRoomText style={[styles.countdownTxt, urgent && styles.countdownTxtUrgent]}>
                    {sweet16Countdown(secondsLeft)}
                  </LiveRoomText>
                </View>
              ) : pick ? (
                <LiveRoomText style={styles.orderPicked} numberOfLines={1}>
                  {pick.teamAbbr}
                </LiveRoomText>
              ) : (
                <LiveRoomText style={styles.orderPending}>—</LiveRoomText>
              )}
            </View>
          );
        })}
      </View>
    ) : null;

  const resultSection =
    status === 'complete' && resultRows.length > 0 ? (
      <View style={styles.section}>
        <LiveRoomText style={styles.sectionHeader}>Final teams</LiveRoomText>
        {resultRows.map((row) => (
          <View key={row.purchaseId} style={styles.resultRow}>
            <View style={styles.orderNum}>
              <LiveRoomText style={styles.orderNumTxt}>{row.turnIndex + 1}</LiveRoomText>
            </View>
            <View style={styles.orderCopy}>
              <LiveRoomText style={styles.orderName} numberOfLines={1}>
                {formatUsernameHandle(row.buyerUsername)}
                {draft?.viewerPurchaseId === row.purchaseId ? '  (you)' : ''}
              </LiveRoomText>
              <LiveRoomText style={styles.resultTeams} numberOfLines={2}>
                {row.boughtTeamLabel ?? 'Bought team'}
                {'  +  '}
                {row.draftedTeamLabel ?? '—'}
                {row.autoAssigned ? ' (auto)' : ''}
              </LiveRoomText>
            </View>
          </View>
        ))}
      </View>
    ) : null;

  const boardSection =
    board.length > 0 ? (
      <View style={styles.section}>
        <View style={styles.boardHeaderRow}>
          <LiveRoomText style={styles.sectionHeader}>Board</LiveRoomText>
          <LiveRoomText style={styles.boardLegend}>
            {counts.open} open · {counts.purchased} bought · {counts.drafted} drafted
          </LiveRoomText>
        </View>
        <View style={styles.grid}>
          {board.map((tile) => (
            <DraftTile
              key={tile.label}
              tile={tile}
              width={tileWidth}
              pickMode={isMyTurn}
              selectable={selectable.has(tile.label)}
              selected={selected === tile.label}
              onPress={() => onTilePress(tile)}
            />
          ))}
        </View>
      </View>
    ) : null;

  let statusPanel: ReactNode;
  if (status === 'complete') {
    statusPanel = (
      <View style={styles.completeBanner}>
        <LiveRoomText style={styles.completeBannerTxt}>Draft complete — every buyer has 2 teams!</LiveRoomText>
      </View>
    );
  } else if (status === 'in_progress' && isMyTurn) {
    statusPanel = (
      <View style={[styles.yourPickBanner, urgent && styles.yourPickBannerUrgent]}>
        <LiveRoomText style={styles.yourPickKicker}>Your pick</LiveRoomText>
        <LiveRoomText style={[styles.yourPickClock, urgent && styles.yourPickClockUrgent]}>
          {sweet16Countdown(secondsLeft)}
        </LiveRoomText>
        <LiveRoomText style={styles.yourPickHint}>
          {selected ? `Selected ${selected} — confirm below` : 'Tap an open team on the board'}
        </LiveRoomText>
      </View>
    );
  } else if (status === 'in_progress') {
    statusPanel = (
      <View style={styles.turnBannerWaiting}>
        <LiveRoomText style={styles.turnBannerWaitingTxt}>
          Waiting for {draft?.currentTurnBuyerUsername ? formatUsernameHandle(draft.currentTurnBuyerUsername) : 'the next buyer'}{' '}
          to pick…
        </LiveRoomText>
      </View>
    );
  } else if (status === 'order_set') {
    statusPanel = (
      <View style={styles.turnBannerWaiting}>
        <LiveRoomText style={styles.turnBannerWaitingTxt}>
          {isHost
            ? 'Order is set. Tap Start draft when you are ready.'
            : 'Waiting for the host to start the draft…'}
        </LiveRoomText>
      </View>
    );
  } else {
    statusPanel = (
      <View style={styles.turnBannerWaiting}>
        <LiveRoomText style={styles.turnBannerWaitingTxt}>
          {isHost
            ? `Sales closed — ${maxSpots} teams sold. Randomize the order to set the draft.`
            : 'Waiting for the host to randomize the draft order…'}
        </LiveRoomText>
      </View>
    );
  }

  const boardFirst = status === 'in_progress' && isMyTurn;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close Sweet 16 draft" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <LiveRoomText style={styles.title}>Sweet 16 Draft</LiveRoomText>
              <LiveRoomText style={styles.sub} numberOfLines={1}>
                {title}
                {draft && status !== 'not_started' ? ` · Pick ${Math.min(madeCount + (status === 'in_progress' ? 1 : 0), totalPicks)} of ${totalPicks}` : ''}
              </LiveRoomText>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
              <LiveRoomText style={styles.closeBtnTxt}>Close</LiveRoomText>
            </Pressable>
          </View>

          {loading && !draft && board.length === 0 ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={vaultColors.gold} />
            </View>
          ) : error && !draft && board.length === 0 ? (
            <View style={styles.centerPad}>
              <LiveRoomText style={styles.errorTxt}>{error}</LiveRoomText>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {statusPanel}
              {boardFirst ? boardSection : null}
              {orderSection}
              {resultSection}
              {!boardFirst ? boardSection : null}
            </ScrollView>
          )}

          {hasFooter ? (
            <View style={styles.footer}>
              {showFooterRandomize ? (
                <Pressable
                  style={[styles.primaryBtn, busy != null && styles.primaryBtnOff]}
                  onPress={runRandomize}
                  disabled={busy != null}
                  accessibilityRole="button"
                  accessibilityLabel="Randomize draft order"
                >
                  {busy === 'randomize' ? (
                    <ActivityIndicator color="#0c0c0e" />
                  ) : (
                    <LiveRoomText style={styles.primaryBtnTxt}>Randomize order</LiveRoomText>
                  )}
                </Pressable>
              ) : null}
              {showFooterStart ? (
                <Pressable
                  style={[styles.primaryBtn, busy != null && styles.primaryBtnOff]}
                  onPress={runStart}
                  disabled={busy != null}
                  accessibilityRole="button"
                  accessibilityLabel="Start draft"
                >
                  {busy === 'start' ? (
                    <ActivityIndicator color="#0c0c0e" />
                  ) : (
                    <LiveRoomText style={styles.primaryBtnTxt}>Start draft</LiveRoomText>
                  )}
                </Pressable>
              ) : null}
              {showFooterPick ? (
                <Pressable
                  style={[styles.primaryBtn, (!selected || busy != null) && styles.primaryBtnOff]}
                  onPress={confirmPick}
                  disabled={!selected || busy != null}
                  accessibilityRole="button"
                  accessibilityLabel={selected ? `Draft ${selected}` : 'Select a team to draft'}
                >
                  {busy === 'pick' ? (
                    <ActivityIndicator color="#0c0c0e" />
                  ) : (
                    <LiveRoomText style={styles.primaryBtnTxt} numberOfLines={1}>
                      {selected ? `Draft ${selected}` : 'Select a team'}
                    </LiveRoomText>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DraftTile({
  tile,
  width,
  pickMode,
  selectable,
  selected,
  onPress,
}: {
  tile: Sweet16BoardTile;
  width: number;
  /** It is the viewer's turn — open tiles are tappable, everything else is dimmed. */
  pickMode: boolean;
  selectable: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const accent = segmentColorForLabel(tile.label, tile.abbr);
  const isOpen = tile.state === 'open';
  const stateLine =
    tile.state === 'open'
      ? 'Open'
      : tile.state === 'purchased'
        ? formatUsernameHandle(tile.buyerUsername)
        : `${formatUsernameHandle(tile.buyerUsername)} · draft`;
  const dim = pickMode && !selectable;
  return (
    <Pressable
      onPress={onPress}
      disabled={!selectable}
      accessibilityRole="button"
      accessibilityLabel={`${tile.label}, ${stateLine}`}
      accessibilityState={{ selected, disabled: !selectable }}
      style={[
        styles.tile,
        { width },
        isOpen && { borderColor: selected ? vaultColors.gold : `${accent}99` },
        tile.state === 'purchased' && styles.tilePurchased,
        tile.state === 'drafted' && styles.tileDrafted,
        selected && styles.tileSelected,
        dim && styles.tileDim,
      ]}
    >
      <View style={[styles.tileDot, { backgroundColor: isOpen ? accent : 'rgba(255,255,255,0.18)' }]} />
      <LiveRoomText style={[styles.tileAbbr, !isOpen && styles.tileAbbrMuted]} numberOfLines={1}>
        {tile.abbr}
      </LiveRoomText>
      <LiveRoomText
        style={[styles.tileState, tile.state === 'drafted' && styles.tileStateDrafted, isOpen && styles.tileStateOpen]}
        numberOfLines={1}
      >
        {stateLine}
      </LiveRoomText>
    </Pressable>
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
    borderColor: 'rgba(203,163,92,0.3)',
    maxHeight: '92%',
  },
  sheetHeader: { alignItems: 'center', paddingTop: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  closeBtnTxt: { fontSize: 13, fontWeight: '700', color: vaultColors.gold },
  centerPad: { paddingVertical: spacing.xl, alignItems: 'center' },
  errorTxt: { fontSize: 14, color: '#ff6b6b', textAlign: 'center' },
  scrollContent: { padding: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  section: { gap: 6 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  boardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardLegend: { fontSize: 11, color: colors.textMuted },
  completeBanner: {
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(52,199,89,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.4)',
  },
  completeBannerTxt: { fontSize: 13, fontWeight: '800', color: '#34c759', textAlign: 'center' },
  yourPickBanner: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(203,163,92,0.18)',
    borderWidth: 1.5,
    borderColor: vaultColors.gold,
  },
  yourPickBannerUrgent: { backgroundColor: 'rgba(255,107,107,0.16)', borderColor: 'rgba(255,107,107,0.75)' },
  yourPickKicker: {
    fontSize: 22,
    fontWeight: '900',
    color: vaultColors.gold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  yourPickClock: { fontSize: 30, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  yourPickClockUrgent: { color: '#ff6b6b' },
  yourPickHint: { fontSize: 12, color: colors.textSecondary },
  turnBannerWaiting: {
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  turnBannerWaitingTxt: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  countdownPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(203,163,92,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.4)',
  },
  countdownPillUrgent: { backgroundColor: 'rgba(255,107,107,0.18)', borderColor: 'rgba(255,107,107,0.5)' },
  countdownTxt: { fontSize: 13, fontWeight: '900', color: vaultColors.gold, fontVariant: ['tabular-nums'] },
  countdownTxtUrgent: { color: '#ff6b6b' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  orderRowCurrent: {
    backgroundColor: 'rgba(203,163,92,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.55)',
  },
  orderRowDone: { opacity: 0.7 },
  orderNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  orderNumCurrent: { backgroundColor: vaultColors.gold },
  orderNumTxt: { fontSize: 12, fontWeight: '900', color: colors.textPrimary },
  orderNumTxtCurrent: { color: '#0c0c0e' },
  orderCopy: { flex: 1 },
  orderName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  orderSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  orderPicked: { fontSize: 13, fontWeight: '900', color: '#34c759' },
  orderPending: { fontSize: 13, color: colors.textMuted },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  resultTeams: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tilePurchased: { backgroundColor: 'rgba(203,163,92,0.08)', borderColor: 'rgba(203,163,92,0.22)' },
  tileDrafted: { backgroundColor: 'rgba(52,199,89,0.1)', borderColor: 'rgba(52,199,89,0.35)' },
  tileSelected: { backgroundColor: 'rgba(203,163,92,0.22)', borderWidth: 2 },
  tileDim: { opacity: 0.45 },
  tileDot: { width: 6, height: 6, borderRadius: 3 },
  tileAbbr: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  tileAbbrMuted: { color: colors.textSecondary },
  tileState: { fontSize: 9, fontWeight: '700', color: colors.textMuted },
  tileStateOpen: { color: vaultColors.gold },
  tileStateDrafted: { color: '#34c759' },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: vaultColors.gold,
  },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnTxt: { fontSize: 16, fontWeight: '900', color: '#0c0c0e' },
});
