import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchBuyerWins, fetchWinClip, type WinClip, type WinListItem } from '../../api/winClipRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'WinClips'>;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function WinPlayer({ clip }: { clip: WinClip }) {
  const player = useVideoPlayer(clip.playlistUrl, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
    />
  );
}

export function WinClipsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [wins, setWins] = useState<WinListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [clip, setClip] = useState<WinClip | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchBuyerWins(token)
      .then((rows) => !cancelled && setWins(rows))
      .catch((e: unknown) => !cancelled && setListError(e instanceof Error ? e.message : 'Could not load your wins.'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const open = useCallback(
    async (w: WinListItem) => {
      if (!token) return;
      setOpenKey(`${w.kind}:${w.id}`);
      setClip(null);
      setClipError(null);
      setClipLoading(true);
      try {
        setClip(await fetchWinClip(token, w.kind, w.id));
      } catch (e) {
        setClipError(e instanceof Error ? e.message : 'The video for this moment is not available.');
      } finally {
        setClipLoading(false);
      }
    },
    [token],
  );

  const close = useCallback(() => {
    setOpenKey(null);
    setClip(null);
    setClipError(null);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerWrap}>
        <PlatformFlowHeader
          title="Watch your wins"
          subtitle="Video receipts from live shows"
          onBack={() => (openKey ? close() : navigation.goBack())}
        />
      </View>

      {openKey ? (
        <View style={styles.playerArea}>
          {clipLoading ? <ActivityIndicator color={colors.gold} style={styles.loader} /> : null}
          {clipError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Video not available</Text>
              <Text style={styles.cardSub}>{clipError}</Text>
            </View>
          ) : null}
          {clip ? (
            <>
              <WinPlayer clip={clip} />
              <View style={styles.meta}>
                <Text style={styles.cardTitle}>{clip.title}</Text>
                <Text style={styles.cardSub}>
                  {clip.subtitle ? `${clip.subtitle} · ` : ''}
                  {formatWhen(clip.wonAt)}
                </Text>
                {clip.showTitle ? <Text style={styles.cardSub}>{clip.showTitle}</Text> : null}
                <Text style={styles.hint}>
                  Your claim happens about {Math.round(clip.momentOffsetSec)} seconds into this clip.
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {!wins && !listError ? <ActivityIndicator color={colors.gold} style={styles.loader} /> : null}
          {listError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Could not load</Text>
              <Text style={styles.cardSub}>{listError}</Text>
            </View>
          ) : null}
          {wins && wins.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No recent wins yet</Text>
              <Text style={styles.cardSub}>
                Spots you claim and items you win in live shows appear here with a short video of the moment.
              </Text>
            </View>
          ) : null}
          {wins?.map((w) => (
            <Pressable
              key={`${w.kind}:${w.id}`}
              onPress={() => void open(w)}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Watch ${w.title}`}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                {w.title}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {w.subtitle ? `${w.subtitle} · ` : ''}
                {formatWhen(w.at)}
              </Text>
              {w.showTitle ? (
                <Text style={styles.cardSub} numberOfLines={1}>
                  {w.showTitle}
                </Text>
              ) : null}
              <Text style={styles.watch}>Watch video receipt</Text>
            </Pressable>
          ))}
          {wins && wins.length > 0 ? (
            <Text style={styles.hint}>Video receipts are kept for 30 days after a show.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: { flexShrink: 0, paddingHorizontal: spacing.lg },
  list: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  loader: { marginTop: spacing.xl },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  cardSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  watch: { marginTop: 8, fontSize: 13, fontWeight: '800', color: colors.gold },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  playerArea: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: radii.lg },
  meta: { gap: 4 },
});
