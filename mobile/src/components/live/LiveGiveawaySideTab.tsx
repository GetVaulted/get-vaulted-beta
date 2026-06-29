import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { enterOpenGiveaway, type ViewerGiveawayRow } from '../../api/liveGiveawayRepository';
import { useGiveawayCountdown } from '../../hooks/useGiveawayCountdown';
import { GIVVY_SIDE_TAB, GIVVY_UI } from '../../lib/givvyUi';
import { LIVE_ROOM_TEXT_PROPS } from '../../lib/liveRoomUiScale';
import { radii, spacing } from '../../theme';

type Props = {
  roomId: string;
  accessToken?: string;
  giveaways: ViewerGiveawayRow[];
  signedIn: boolean;
  /** @deprecated Side tab uses one layout on all devices. */
  compact?: boolean;
  onRequireAuth?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
};

function PanelCountdown({
  entryCloseAt,
  onExpired,
}: {
  entryCloseAt: string | null | undefined;
  onExpired?: () => void;
}) {
  const { label } = useGiveawayCountdown(entryCloseAt, onExpired);
  if (!label) return null;
  return <Text style={styles.panelTimer}>{label}</Text>;
}

/** Left-edge Givvy tab — matches seller Givvy pill branding (green glass rail). */
export function LiveGiveawaySideTab({
  roomId,
  accessToken,
  giveaways,
  signedIn,
  onRequireAuth,
  onEntered,
  onTimerExpired,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [enteredIds, setEnteredIds] = useState<Set<string>>(
    () => new Set(giveaways.filter((g) => g.viewerEntered).map((g) => g.id)),
  );
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => giveaways.filter((g) => g.kind === 'open' && g.status === 'entries_open'),
    [giveaways],
  );

  const primary = visible[0];
  const needsEntry = visible.some((g) => !g.viewerEntered && !enteredIds.has(g.id));
  const entryCount = primary?.entryCount ?? 0;

  useEffect(() => {
    if (visible.length === 0) setOpen(false);
  }, [visible.length]);

  useEffect(() => {
    setEnteredIds(new Set(giveaways.filter((g) => g.viewerEntered).map((g) => g.id)));
  }, [giveaways]);

  if (visible.length === 0 || !primary) return null;

  const entered = enteredIds.has(primary.id) || primary.viewerEntered;

  const handleEnter = async () => {
    if (!signedIn || !accessToken?.trim()) {
      onRequireAuth?.();
      return;
    }
    setBusyId(primary.id);
    setError(null);
    try {
      await enterOpenGiveaway(accessToken, roomId, primary.id);
      setEnteredIds((prev) => new Set([...prev, primary.id]));
      onEntered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enter.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      {!open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Givvy"
          onPress={() => setOpen(true)}
          style={[styles.tab, needsEntry ? styles.tabNeedsEntry : null]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.androidFill} />
          )}
          <View style={styles.tabInner}>
            <Text style={styles.tabTitle} numberOfLines={1} {...LIVE_ROOM_TEXT_PROPS}>
              Givvy
            </Text>
            <View style={styles.giftWrap}>
              <Ionicons name="gift-outline" size={GIVVY_SIDE_TAB.iconSize} color={GIVVY_UI.icon} />
              {needsEntry ? <View style={styles.giftSpark} /> : null}
            </View>
            <Text style={styles.entryCount} {...LIVE_ROOM_TEXT_PROPS}>
              {entryCount}
            </Text>
            <Text style={styles.entryLabel} numberOfLines={1} {...LIVE_ROOM_TEXT_PROPS}>
              Entries
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.panel}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.panelAndroidFill} />
          )}
          <View style={styles.panelInner}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleCol}>
                <Text style={styles.panelKicker} {...LIVE_ROOM_TEXT_PROPS}>
                  Givvy
                </Text>
                <Text style={styles.panelTitle} numberOfLines={2} {...LIVE_ROOM_TEXT_PROPS}>
                  {primary.title}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Minimize Givvy"
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={styles.minimizeBtn}
              >
                <Ionicons name="contract-outline" size={18} color="rgba(255,255,255,0.72)" />
              </Pressable>
            </View>

            {primary.prizeDescription ? (
              <Text style={styles.panelPrize} numberOfLines={2} {...LIVE_ROOM_TEXT_PROPS}>
                {primary.prizeDescription}
              </Text>
            ) : null}

            <View style={styles.panelMetaRow}>
              <Ionicons name="gift-outline" size={14} color={GIVVY_UI.icon} />
              <Text style={styles.panelMetaTxt} {...LIVE_ROOM_TEXT_PROPS}>
                {entryCount} {entryCount === 1 ? 'Entry' : 'Entries'}
              </Text>
              {primary.entryCloseAt ? (
                <PanelCountdown entryCloseAt={primary.entryCloseAt} onExpired={onTimerExpired} />
              ) : null}
            </View>

            {entered ? (
              <View style={styles.enteredPill}>
                <Text style={styles.enteredTxt} {...LIVE_ROOM_TEXT_PROPS}>
                  {primary.viewerActiveInDrawing === false
                    ? 'Entered · return to stay in the drawing'
                    : 'You’re in the drawing'}
                </Text>
              </View>
            ) : (
              <Pressable style={styles.enterBtn} disabled={busyId === primary.id} onPress={() => void handleEnter()}>
                {busyId === primary.id ? (
                  <ActivityIndicator color="#18181b" size="small" />
                ) : (
                  <Text style={styles.enterBtnTxt} {...LIVE_ROOM_TEXT_PROPS}>
                    Enter Givvy
                  </Text>
                )}
              </Pressable>
            )}

            {error ? (
              <Text style={styles.error} {...LIVE_ROOM_TEXT_PROPS}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    maxWidth: '92%',
  },
  tab: {
    width: GIVVY_SIDE_TAB.width,
    minHeight: GIVVY_SIDE_TAB.minHeight,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderColor: GIVVY_UI.border,
    backgroundColor: GIVVY_UI.pillBg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 2, height: 0 },
    elevation: 8,
  },
  tabNeedsEntry: {
    borderColor: GIVVY_UI.borderStrong,
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GIVVY_UI.sideTabAndroidFill,
  },
  tabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: GIVVY_SIDE_TAB.padH,
    gap: GIVVY_SIDE_TAB.innerGap,
  },
  tabTitle: {
    fontSize: GIVVY_SIDE_TAB.titleSize,
    fontWeight: '800',
    color: GIVVY_UI.label,
    letterSpacing: 0.1,
    lineHeight: GIVVY_SIDE_TAB.titleLine,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  giftWrap: {
    position: 'relative',
    marginVertical: 1,
  },
  giftSpark: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GIVVY_UI.icon,
    opacity: 0.9,
  },
  entryCount: {
    fontSize: GIVVY_SIDE_TAB.countSize,
    fontWeight: '800',
    color: GIVVY_UI.count,
    lineHeight: GIVVY_SIDE_TAB.countLine,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  entryLabel: {
    fontSize: GIVVY_SIDE_TAB.entriesSize,
    fontWeight: '600',
    color: GIVVY_UI.countMuted,
    lineHeight: GIVVY_SIDE_TAB.entriesLine,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  panel: {
    width: 280,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GIVVY_UI.border,
    backgroundColor: GIVVY_UI.pillBg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  panelAndroidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GIVVY_UI.androidFill,
  },
  panelInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  panelTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  panelKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: GIVVY_UI.label,
    letterSpacing: 0.15,
    lineHeight: 12,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fafafa',
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  minimizeBtn: {
    padding: 2,
  },
  panelPrize: {
    fontSize: 12,
    color: 'rgba(250,250,250,0.65)',
    lineHeight: 16,
  },
  panelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  panelMetaTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(250,250,250,0.88)',
  },
  panelTimer: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(250,250,250,0.55)',
    fontVariant: ['tabular-nums'],
  },
  enterBtn: {
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: '#fafafa',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  enterBtnTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#18181b',
    letterSpacing: -0.1,
  },
  enteredPill: {
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GIVVY_UI.border,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  enteredTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: GIVVY_UI.label,
    textAlign: 'center',
    lineHeight: 16,
  },
  error: {
    fontSize: 11,
    color: '#fca5a5',
    textAlign: 'center',
  },
});
