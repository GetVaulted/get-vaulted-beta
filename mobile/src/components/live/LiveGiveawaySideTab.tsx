import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewerGiveawayRow } from '../../api/liveGiveawayRepository';
import { radii, spacing } from '../../theme';
import { LiveGiveawayEnterChip } from './LiveGiveawayEnterChip';

type Props = {
  roomId: string;
  accessToken?: string;
  giveaways: ViewerGiveawayRow[];
  signedIn: boolean;
  onRequireAuth?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
};

/** Left-edge ghost tab — expands into the emerald giveaway enter panel for buyers. */
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

  const visible = useMemo(
    () => giveaways.filter((g) => g.kind === 'open' && g.status === 'entries_open'),
    [giveaways],
  );

  const needsEntry = visible.some((g) => !g.viewerEntered);
  const primary = visible[0];
  const entryLabel =
    primary && primary.entryCount > 0 ? `${primary.entryCount} Entries` : null;

  useEffect(() => {
    if (visible.length === 0) setOpen(false);
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close giveaway' : 'Open giveaway'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={[styles.tab, needsEntry && !open ? styles.tabPulse : null]}
      >
        <Text style={styles.tabEmoji}>🎁</Text>
        <Text style={styles.tabLabel}>Givvy</Text>
        {!open && entryLabel ? <Text style={styles.tabEntries}>{entryLabel}</Text> : null}
        {needsEntry ? <View style={styles.dot} /> : null}
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <LiveGiveawayEnterChip
            roomId={roomId}
            accessToken={accessToken}
            giveaways={giveaways}
            signedIn={signedIn}
            onRequireAuth={onRequireAuth}
            onEntered={onEntered}
            onTimerExpired={onTimerExpired}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '88%',
  },
  tab: {
    width: 34,
    minHeight: 72,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(16,185,129,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    shadowColor: '#10b981',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 2, height: 0 },
  },
  tabPulse: {
    backgroundColor: 'rgba(16,185,129,0.32)',
  },
  tabEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  tabLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: '900',
    color: '#ecfdf5',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tabEntries: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: '700',
    color: 'rgba(167,243,208,0.75)',
    textAlign: 'center',
  },
  dot: {
    position: 'absolute',
    top: 6,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#6ee7b7',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.xs,
    maxWidth: 280,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.25)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing.sm,
  },
});
