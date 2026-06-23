import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { enterOpenGiveaway, type ViewerGiveawayRow } from '../../api/liveGiveawayRepository';
import { useGiveawayCountdown } from '../../hooks/useGiveawayCountdown';
import { radii, spacing } from '../../theme';

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
    (g) => g.kind === 'open' && g.status === 'entries_open',
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
              <Text style={styles.title} numberOfLines={2}>
                {g.title}
              </Text>
              {g.prizeDescription ? (
                <Text style={styles.prize} numberOfLines={2}>
                  {g.prizeDescription}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{g.entryCount} entries</Text>
                {g.entryCloseAt ? (
                  <GiveawayCountdownText entryCloseAt={g.entryCloseAt} onExpired={onTimerExpired} />
                ) : null}
              </View>
            </View>
            {entered ? (
              <Text style={styles.entered}>
                {g.viewerActiveInDrawing === false ? 'Entered · return to stay in' : 'Entered'}
              </Text>
            ) : (
              <Pressable
                style={styles.btn}
                disabled={busyId === g.id}
                onPress={() => void handleEnter(g.id)}
              >
                {busyId === g.id ? (
                  <ActivityIndicator color="#052e26" size="small" />
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
  wrap: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(16,185,129,0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  copy: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(167,243,208,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  title: { fontSize: 14, fontWeight: '800', color: '#ecfdf5', marginTop: 2 },
  prize: { fontSize: 11, color: 'rgba(167,243,208,0.75)', marginTop: 2, lineHeight: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  meta: { fontSize: 10, fontWeight: '700', color: 'rgba(167,243,208,0.65)', textTransform: 'uppercase' },
  timer: { fontSize: 10, fontWeight: '800', color: '#c4b5fd', fontVariant: ['tabular-nums'] },
  btn: {
    borderRadius: radii.pill,
    backgroundColor: '#34d399',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minWidth: 72,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  btnTxt: { fontSize: 12, fontWeight: '900', color: '#052e26', letterSpacing: 0.4 },
  entered: {
    fontSize: 10,
    fontWeight: '800',
    color: '#a7f3d0',
    textTransform: 'uppercase',
    textAlign: 'center',
    maxWidth: 88,
  },
  error: { fontSize: 10, color: '#fca5a5' },
});
