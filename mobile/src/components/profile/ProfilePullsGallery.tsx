import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  deletePullComment,
  fetchPullComments,
  fetchSellerPullMedia,
  likePullMedia,
  postPullComment,
  unlikePullMedia,
  type PullCommentDto,
  type PullMediaDto,
} from '../../api/pullMediaRepository';
import { colors, radii, spacing } from '../../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 3;
const COLUMNS = 3;
const TILE_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** In-grid teaser tile: muted, looping, no controls. No PiP — see mobile/patches/expo-video+3.0.16.patch. */
function PullVideoTile({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

/** Full-screen tap-through: unmuted, real controls, no loop. */
function PullVideoDetail({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.detailMedia}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
    />
  );
}

type Props = {
  sellerId: string;
  /** Signed-in viewer's Supabase access token — required to like or comment, optional to browse. */
  viewerAccessToken?: string | null;
};

export function ProfilePullsGallery({ sellerId, viewerAccessToken }: Props) {
  const [media, setMedia] = useState<PullMediaDto[] | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [comments, setComments] = useState<PullCommentDto[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const listRef = useRef<FlatList<PullCommentDto>>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSellerPullMedia(sellerId).then((rows) => {
      if (!cancelled) setMedia(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const openItem = openIndex != null && media ? media[openIndex] : null;

  const loadComments = useCallback((id: string) => {
    setComments(null);
    void fetchPullComments(id).then(setComments);
  }, []);

  useEffect(() => {
    if (openItem) loadComments(openItem.id);
    else setComments(null);
    setDraft('');
  }, [openItem?.id, loadComments]);

  const patchItem = (id: string, patch: Partial<PullMediaDto>) => {
    setMedia((prev) => (prev ? prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) : prev));
  };

  const toggleLike = async () => {
    if (!openItem || likeBusy) return;
    if (!viewerAccessToken) return;
    setLikeBusy(true);
    try {
      const result = openItem.viewerHasLiked
        ? await unlikePullMedia(viewerAccessToken, openItem.id)
        : await likePullMedia(viewerAccessToken, openItem.id);
      patchItem(openItem.id, { viewerHasLiked: result.liked, likeCount: result.likeCount });
    } catch {
      // Best-effort — leave optimistic state as-is on failure.
    } finally {
      setLikeBusy(false);
    }
  };

  const submitComment = async () => {
    if (!openItem || posting) return;
    const body = draft.trim();
    if (!body || !viewerAccessToken) return;
    setPosting(true);
    try {
      const comment = await postPullComment(viewerAccessToken, openItem.id, body);
      setComments((prev) => [...(prev ?? []), comment]);
      patchItem(openItem.id, { commentCount: (openItem.commentCount ?? 0) + 1 });
      setDraft('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      // Best-effort.
    } finally {
      setPosting(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!openItem || !viewerAccessToken) return;
    try {
      await deletePullComment(viewerAccessToken, openItem.id, commentId);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
      patchItem(openItem.id, { commentCount: Math.max(0, (openItem.commentCount ?? 1) - 1) });
    } catch {
      // Best-effort.
    }
  };

  if (media == null) {
    return <ActivityIndicator color={colors.gold} style={styles.loader} />;
  }

  if (!media.length) {
    return <Text style={styles.empty}>No pulls shared yet.</Text>;
  }

  return (
    <View style={styles.block}>
      <View style={styles.grid}>
        {media.map((item, index) => (
          <Pressable
            key={item.id}
            style={[styles.tile, { width: TILE_SIZE, height: TILE_SIZE }]}
            onPress={() => setOpenIndex(index)}
          >
            {item.type === 'PHOTO' ? (
              <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <PullVideoTile url={item.url} />
                <View style={styles.playBadge} pointerEvents="none">
                  <Ionicons name="play" size={14} color="#fff" />
                </View>
              </>
            )}
            {(item.likeCount ?? 0) > 0 ? (
              <View style={styles.likeBadge} pointerEvents="none">
                <Ionicons name="heart" size={11} color="#fff" />
                <Text style={styles.likeBadgeText}>{formatCount(item.likeCount ?? 0)}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Modal visible={openItem != null} animationType="fade" onRequestClose={() => setOpenIndex(null)} transparent>
        <KeyboardAvoidingView
          style={styles.detailRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.detailClose} onPress={() => setOpenIndex(null)} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.detailMediaWrap}>
            {openItem?.type === 'PHOTO' ? (
              <Image source={{ uri: openItem.url }} style={styles.detailMedia} contentFit="contain" />
            ) : openItem ? (
              <PullVideoDetail url={openItem.url} />
            ) : null}
          </View>

          {openItem ? (
            <View style={styles.panel}>
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.likeButton}
                  onPress={() => void toggleLike()}
                  disabled={likeBusy || !viewerAccessToken}
                  hitSlop={8}
                >
                  <Ionicons
                    name={openItem.viewerHasLiked ? 'heart' : 'heart-outline'}
                    size={20}
                    color={openItem.viewerHasLiked ? '#ef4444' : colors.textPrimary}
                  />
                  <Text style={styles.actionCount}>{(openItem.likeCount ?? 0).toLocaleString()}</Text>
                </Pressable>
                <Text style={styles.commentCount}>
                  {(openItem.commentCount ?? 0).toLocaleString()} comments
                </Text>
              </View>

              <FlatList
                ref={listRef}
                data={comments ?? []}
                keyExtractor={(c) => c.id}
                style={styles.commentList}
                contentContainerStyle={styles.commentListContent}
                ListEmptyComponent={
                  comments == null ? (
                    <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.md }} />
                  ) : (
                    <Text style={styles.empty}>No comments yet. Say something nice.</Text>
                  )
                }
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>@{item.author.username}</Text>
                      <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{item.body}</Text>
                    {item.canDelete ? (
                      <Pressable onPress={() => void removeComment(item.id)} hitSlop={6}>
                        <Text style={styles.commentDelete}>Delete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              />

              {viewerAccessToken ? (
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Add a comment…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    maxLength={500}
                  />
                  <Pressable onPress={() => void submitComment()} disabled={posting || !draft.trim()} hitSlop={8}>
                    <Text style={[styles.postLabel, (!draft.trim() || posting) && styles.postLabelDisabled]}>
                      Post
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.signInHint}>Sign in to like or comment.</Text>
              )}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.sm },
  loader: { marginTop: spacing.xl },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  likeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  detailRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  detailClose: {
    position: 'absolute',
    top: 56,
    right: spacing.lg,
    zIndex: 1,
  },
  detailMediaWrap: {
    height: '46%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailMedia: {
    width: '100%',
    height: '100%',
  },
  panel: {
    flex: 1,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  commentCount: { color: colors.textSecondary, fontSize: 13 },
  commentList: { flex: 1 },
  commentListContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  commentRow: { gap: 2 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  commentAuthor: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  commentTime: { color: colors.textMuted, fontSize: 10 },
  commentBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  commentDelete: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: spacing.xs },
  postLabel: { color: colors.gold, fontSize: 14, fontWeight: '700' },
  postLabelDisabled: { color: colors.textMuted },
  signInHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});
