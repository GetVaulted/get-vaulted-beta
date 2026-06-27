import { Ionicons } from '@expo/vector-icons';

import { BlurView } from 'expo-blur';

import { useEffect, useMemo, useState } from 'react';

import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { enterOpenGiveaway, type ViewerGiveawayRow } from '../../api/liveGiveawayRepository';

import { useGiveawayCountdown } from '../../hooks/useGiveawayCountdown';

import { radii, spacing } from '../../theme';



type Props = {

  roomId: string;

  accessToken?: string;

  giveaways: ViewerGiveawayRow[];

  signedIn: boolean;

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



/** Left-edge dark glass tab — Whatnot-style giveaway rail (Giveaway + entry count). */

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

          accessibilityLabel="Open giveaway"

          onPress={() => setOpen(true)}

          style={[styles.tab, needsEntry ? styles.tabNeedsEntry : null]}

        >

          {Platform.OS === 'ios' ? (

            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />

          ) : (

            <View style={styles.androidFill} />

          )}

          <View style={styles.tabInner}>

            <Text style={styles.tabTitle}>Giveaway</Text>

            <View style={styles.tabMeta}>

              <View style={styles.giftWrap}>

                <Ionicons name="gift-outline" size={20} color="#f4f4f5" />

                {needsEntry ? <View style={styles.giftSpark} /> : null}

              </View>

              <View style={styles.entryStack}>

                <Text style={styles.entryCount}>{entryCount}</Text>

                <Text style={styles.entryLabel}>Entries</Text>

              </View>

            </View>

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

              <Text style={styles.panelTitle} numberOfLines={2}>

                {primary.title}

              </Text>

              <Pressable

                accessibilityRole="button"

                accessibilityLabel="Minimize giveaway"

                onPress={() => setOpen(false)}

                hitSlop={8}

                style={styles.minimizeBtn}

              >

                <Ionicons name="contract-outline" size={18} color="rgba(255,255,255,0.72)" />

              </Pressable>

            </View>



            {primary.prizeDescription ? (

              <Text style={styles.panelPrize} numberOfLines={2}>

                {primary.prizeDescription}

              </Text>

            ) : null}



            <View style={styles.panelMetaRow}>

              <Ionicons name="gift-outline" size={14} color="rgba(255,255,255,0.88)" />

              <Text style={styles.panelMetaTxt}>

                {entryCount} {entryCount === 1 ? 'Entry' : 'Entries'}

              </Text>

              {primary.entryCloseAt ? (

                <PanelCountdown entryCloseAt={primary.entryCloseAt} onExpired={onTimerExpired} />

              ) : null}

            </View>



            {entered ? (

              <View style={styles.enteredPill}>

                <Text style={styles.enteredTxt}>

                  {primary.viewerActiveInDrawing === false

                    ? 'Entered · return to stay in the drawing'

                    : 'You’re in the drawing'}

                </Text>

              </View>

            ) : (

              <Pressable

                style={styles.enterBtn}

                disabled={busyId === primary.id}

                onPress={() => void handleEnter()}

              >

                {busyId === primary.id ? (

                  <ActivityIndicator color="#18181b" size="small" />

                ) : (

                  <Text style={styles.enterBtnTxt}>Enter Giveaway</Text>

                )}

              </Pressable>

            )}



            {error ? <Text style={styles.error}>{error}</Text> : null}

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

    width: 58,

    minHeight: 96,

    borderTopRightRadius: radii.lg,

    borderBottomRightRadius: radii.lg,

    borderWidth: StyleSheet.hairlineWidth,

    borderLeftWidth: 0,

    borderColor: 'rgba(255,255,255,0.14)',

    overflow: 'hidden',

    shadowColor: '#000',

    shadowOpacity: 0.45,

    shadowRadius: 12,

    shadowOffset: { width: 2, height: 0 },

    elevation: 8,

  },

  tabNeedsEntry: {

    borderColor: 'rgba(255,255,255,0.22)',

  },

  androidFill: {

    ...StyleSheet.absoluteFillObject,

    backgroundColor: 'rgba(24,24,27,0.78)',

  },

  tabInner: {

    flex: 1,

    paddingVertical: spacing.sm,

    paddingHorizontal: 6,

    gap: 8,

  },

  tabTitle: {

    fontSize: 11,

    fontWeight: '700',

    color: '#fafafa',

    letterSpacing: -0.2,

  },

  tabMeta: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

  },

  giftWrap: {

    position: 'relative',

  },

  giftSpark: {

    position: 'absolute',

    top: -2,

    right: -2,

    width: 6,

    height: 6,

    borderRadius: 3,

    backgroundColor: '#fafafa',

    opacity: 0.85,

  },

  entryStack: {

    minWidth: 0,

    flex: 1,

  },

  entryCount: {

    fontSize: 22,

    fontWeight: '800',

    color: '#fafafa',

    lineHeight: 24,

    fontVariant: ['tabular-nums'],

  },

  entryLabel: {

    fontSize: 10,

    fontWeight: '600',

    color: 'rgba(250,250,250,0.72)',

    marginTop: -1,

  },

  panel: {

    width: 280,

    borderRadius: radii.lg,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: 'rgba(255,255,255,0.12)',

    overflow: 'hidden',

    shadowColor: '#000',

    shadowOpacity: 0.5,

    shadowRadius: 16,

    shadowOffset: { width: 0, height: 6 },

    elevation: 12,

  },

  panelAndroidFill: {

    ...StyleSheet.absoluteFillObject,

    backgroundColor: 'rgba(24,24,27,0.88)',

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

  panelTitle: {

    flex: 1,

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

    borderColor: 'rgba(255,255,255,0.18)',

    backgroundColor: 'rgba(255,255,255,0.08)',

    paddingHorizontal: spacing.md,

    paddingVertical: spacing.sm + 2,

    alignItems: 'center',

  },

  enteredTxt: {

    fontSize: 12,

    fontWeight: '700',

    color: 'rgba(250,250,250,0.88)',

    textAlign: 'center',

    lineHeight: 16,

  },

  error: {

    fontSize: 11,

    color: '#fca5a5',

    textAlign: 'center',

  },

});


