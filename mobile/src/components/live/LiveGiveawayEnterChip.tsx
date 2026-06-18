import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { enterOpenGiveaway, type ViewerGiveawayRow } from '../../api/liveGiveawayRepository';
import { useGiveawayCountdown } from '../../hooks/useGiveawayCountdown';
import { colors, radii, spacing } from '../../theme';

function GiveawayCountdownText({
  entryCloseAt,
  onExpired,
}: {
  entryCloseAt: string | null | undefined;
  onExpired?: () => void;
}) {
  const { label } = useGiveawayCountdown(entryCloseAt, onExpired);
  if (!label) return null;
  return <Text style={styles.timer}>{label}</Text>;
}

export function LiveGiveawayEnterChip({
  roomId,
  accessToken,
  giveaways,
  signedIn,
  onRequireAuth,
  onEntered,
  onTimerExpired,
}: {
  roomId: string;
  accessToken?: string;
  giveaways: ViewerGiveawayRow[];
  signedIn: boolean;
  onRequireAuth?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [enteredIds, setEnteredIds] = useState<Set<string>>(
    () => new Set(giveaways.filter((g) => g.viewerEntered).map((g) => g.id)),
  );
  const [error, setError] = useState<string | null>(null);

  const visible = giveaways.filter(
    (g) => g.kind === 'open' && g.status === 'entries_open' && g.canEnter !== false,
  );
  if (visible.length === 0) return null;

  const handleEnter = useCallback(
    async (giveawayId: string) => {
      if (!signedIn || !accessToken?.trim()) {
        onRequireAuth?.();
        return;
      }
      setBusyId(giveawayId);
      setError(null);
      try {
        await enterOpenGiveaway(accessToken, roomId, giveawayId);
        setEnteredIds((prev) => new Set([...prev, giveawayId]));
        onEntered?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not enter.');
      } finally {
        setBusyId(null);
      }
    },
    [accessToken, onEntered, onRequireAuth, roomId, signedIn],
  );

  return (
    <View style={styles.wrap}>
      {visible.map((g) => {
        const entered = enteredIds.has(g.id) || g.viewerEntered;
        return (
          <View key={g.id} style={styles.card}>
            <View style={styles.copy}>
              <Text style={styles.kicker}>Giveaway</Text>
              <Text style={styles.title} numberOfLines={1}>
                {g.title}
              </Text>
              {g.prizeDescription ? (
                <Text style={styles.prize} numberOfLines={1}>
                  {g.prizeDescription}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{g.entryCount} entered</Text>
                {g.entryCloseAt ? (
                  <GiveawayCountdownText entryCloseAt={g.entryCloseAt} onExpired={onTimerExpired} />
                ) : null}
              </View>
            </View>
            {entered ? (
              <Text style={styles.entered}>Entered</Text>
            ) : (
              <Pressable
                style={styles.btn}
                disabled={busyId === g.id}
                onPress={() => void handleEnter(g.id)}
              >
                {busyId === g.id ? (
                  <ActivityIndicator color="#111" size="small" />
                ) : (
                  <Text style={styles.btnTxt}>Enter</Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(16,185,129,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  copy: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(167,243,208,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: { fontSize: 12, fontWeight: '700', color: '#ecfdf5' },
  prize: { fontSize: 10, color: 'rgba(167,243,208,0.7)', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: { fontSize: 9, fontWeight: '600', color: 'rgba(167,243,208,0.55)', textTransform: 'uppercase' },
  timer: { fontSize: 9, fontWeight: '700', color: '#c4b5fd', fontVariant: ['tabular-nums'] },
  btn: {
    borderRadius: radii.pill,
    backgroundColor: '#6ee7b7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  btnTxt: { fontSize: 11, fontWeight: '900', color: '#111' },
  entered: {
    fontSize: 10,
    fontWeight: '800',
    color: '#a7f3d0',
    textTransform: 'uppercase',
  },
  error: { fontSize: 10, color: '#fca5a5' },
});
