import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSweet16Draft,
  pickSweet16DraftTeam,
  type Sweet16DraftSnapshot,
} from '../../api/liveSweet16DraftRepository';
import { colors, radii, spacing, vaultColors } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

/** How often to re-poll draft state while the sheet is open. Server is authoritative either way. */
const POLL_MS = 3000;

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `0:${s.toString().padStart(2, '0')}`;
}

/**
 * Sweet 16 Break — live turn-based draft. Shown to every buyer who bought a blind slot (and, in
 * spectator form, to the host) once the 16-slot board sells out and the host starts the draft.
 * Server-validates turn ownership and the deadline on every pick — this sheet's own gating
 * (hiding the picker for non-current buyers) is a nicety only, never the real gate.
 */
export function LiveSweet16DraftSheet({
  visible,
  onClose,
  roomId,
  itemId,
  title,
  accessToken,
  onDraftComplete,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  itemId: string;
  title: string;
  accessToken?: string;
  /** Fired once when the draft transitions to complete, while this sheet is open. */
  onDraftComplete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Sweet16DraftSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const notifiedCompleteRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchSweet16Draft(accessToken ?? '', roomId, itemId);
      setDraft(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the draft.');
    }
  }, [accessToken, roomId, itemId]);

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

  useEffect(() => {
    if (draft?.status === 'complete' && !notifiedCompleteRef.current) {
      notifiedCompleteRef.current = true;
      onDraftComplete?.();
    }
  }, [draft?.status, onDraftComplete]);

  const isMyTurn = Boolean(
    draft?.viewerPurchaseId && draft.currentTurnPurchaseId && draft.viewerPurchaseId === draft.currentTurnPurchaseId,
  );
  // Buzz once per turn that is mine (a multi-slot buyer gets one per slot), so a buyer who is
  // looking at the stream rather than the sheet still notices the 60-second clock starting.
  const buzzedTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const turnId = draft?.status === 'in_progress' && isMyTurn ? draft.currentTurnPurchaseId : null;
    if (!turnId) {
      buzzedTurnRef.current = null;
      return;
    }
    if (buzzedTurnRef.current === turnId) return;
    buzzedTurnRef.current = turnId;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [draft?.status, draft?.currentTurnPurchaseId, isMyTurn]);
  const deadlineMs = draft?.currentTurnDeadlineAt ? new Date(draft.currentTurnDeadlineAt).getTime() : null;
  const remainingMs = deadlineMs != null ? deadlineMs - nowMs : null;

  const pickTeam = (teamLabel: string) => {
    if (!draft || pickBusy) return;
    setPickBusy(true);
    void pickSweet16DraftTeam({ accessToken: accessToken ?? '', roomId, itemId, teamLabel })
      .then((next) => setDraft(next))
      .catch((e) => {
        Alert.alert('Sweet 16 Draft', e instanceof Error ? e.message : 'Could not record your pick.');
        void load();
      })
      .finally(() => setPickBusy(false));
  };

  const totalPicks = draft?.turnOrder.length ?? 16;
  const madeCount = draft?.picks.length ?? 0;

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
              </LiveRoomText>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
              <LiveRoomText style={styles.closeBtnTxt}>Close</LiveRoomText>
            </Pressable>
          </View>

          {loading && !draft ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={vaultColors.gold} />
            </View>
          ) : error && !draft ? (
            <View style={styles.centerPad}>
              <LiveRoomText style={styles.errorTxt}>{error}</LiveRoomText>
            </View>
          ) : !draft || draft.status === 'not_started' ? (
            <View style={styles.centerPad}>
              <LiveRoomText style={styles.waitingTxt}>Waiting for the host to start the draft…</LiveRoomText>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.progressRow}>
                <LiveRoomText style={styles.progressTxt}>
                  Pick {Math.min(madeCount + (draft.status === 'in_progress' ? 1 : 0), totalPicks)} of {totalPicks}
                </LiveRoomText>
                {draft.status === 'in_progress' && remainingMs != null ? (
                  <View style={[styles.countdownPill, remainingMs <= 10000 && styles.countdownPillUrgent]}>
                    <LiveRoomText style={styles.countdownTxt}>{formatCountdown(remainingMs)}</LiveRoomText>
                  </View>
                ) : null}
              </View>

              {draft.status === 'complete' ? (
                <View style={styles.completeBanner}>
                  <LiveRoomText style={styles.completeBannerTxt}>
                    Draft complete — every slot has a team!
                  </LiveRoomText>
                </View>
              ) : isMyTurn ? (
                <View style={styles.turnBanner}>
                  <LiveRoomText style={styles.turnBannerTxt}>Your turn — pick a team</LiveRoomText>
                </View>
              ) : (
                <View style={styles.turnBannerWaiting}>
                  <LiveRoomText style={styles.turnBannerWaitingTxt}>
                    Waiting for {draft.currentTurnBuyerUsername ? `@${draft.currentTurnBuyerUsername}` : 'the next buyer'}{' '}
                    to pick…
                  </LiveRoomText>
                </View>
              )}

              {draft.status === 'in_progress' && isMyTurn ? (
                <View style={styles.teamGrid}>
                  {draft.remainingTeamLabels.map((label) => (
                    <Pressable
                      key={label}
                      style={[styles.teamChip, pickBusy && styles.teamChipOff]}
                      onPress={() => pickTeam(label)}
                      disabled={pickBusy}
                    >
                      <LiveRoomText style={styles.teamChipTxt}>{label}</LiveRoomText>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {draft.picks.length > 0 ? (
                <View style={styles.picksSection}>
                  <LiveRoomText style={styles.picksHeader}>Picks so far</LiveRoomText>
                  {[...draft.picks]
                    .sort((a, b) => b.turnIndex - a.turnIndex)
                    .map((p) => (
                      <View key={p.purchaseId} style={styles.pickRow}>
                        <LiveRoomText style={styles.pickRowLabel} numberOfLines={1}>
                          {p.teamLabel}
                        </LiveRoomText>
                        <LiveRoomText style={styles.pickRowBuyer} numberOfLines={1}>
                          {p.buyerUsername ? `@${p.buyerUsername}` : 'unknown'}
                          {p.autoAssigned ? ' · auto' : ''}
                        </LiveRoomText>
                      </View>
                    ))}
                </View>
              ) : null}
            </ScrollView>
          )}
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
    borderColor: 'rgba(203,163,92,0.3)',
    maxHeight: '86%',
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
  waitingTxt: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  errorTxt: { fontSize: 14, color: '#ff6b6b', textAlign: 'center' },
  scrollContent: { padding: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTxt: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
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
  completeBanner: {
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(52,199,89,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.4)',
  },
  completeBannerTxt: { fontSize: 13, fontWeight: '800', color: '#34c759', textAlign: 'center' },
  turnBanner: {
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(203,163,92,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.45)',
  },
  turnBannerTxt: { fontSize: 14, fontWeight: '900', color: vaultColors.gold, textAlign: 'center' },
  turnBannerWaiting: {
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  turnBannerWaitingTxt: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  teamChip: {
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.3)',
  },
  teamChipOff: { opacity: 0.5 },
  teamChipTxt: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  picksSection: { marginTop: spacing.sm, gap: 6 },
  picksHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickRowLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  pickRowBuyer: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.sm },
});
