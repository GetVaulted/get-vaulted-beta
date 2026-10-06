import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchMessageThread,
  patchThreadAction,
  sendThreadMessage,
  uploadThreadImage,
} from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { pickSingleImageFromLibrary } from '../../createListing/pickListingMedia';
import { prepareMessageImageForUpload } from '../../lib/messageImagePrepare';
import { MentionComposerInput } from '../../components/mentions/MentionComposerInput';
import { MessageBubble } from '../../components/messages/MessageBubble';
import { MessagePersonBadges } from '../../components/messages/MessagePersonBadges';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { PremiumEmptyPanel } from '../../components/empty/PremiumEmptyPanel';
import type { RootStackParamList } from '../../navigation/types';
import { buildThreadRows, type ThreadListRow } from '../../lib/messageDisplay';
import type { ThreadDetail, ThreadMessage } from '../../types/messages';
import { colors, spacing } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';
import { deriveMessageThreadViewState, describeThreadLoadError } from './messageThreadViewState';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageThread'>;

export function MessageThreadScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const token = session?.access_token;
  const threadId = route.params.threadId;

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchMessageThread(token, threadId);
      setThread(data.thread);
      setMessages(data.messages);
      setLoadError(null);
    } catch (e) {
      setLoadError(describeThreadLoadError(e));
    } finally {
      setLoading(false);
    }
  }, [threadId, token]);

  const onRetryLoad = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      void load();
    }, 8000);
    return () => clearInterval(poll);
  }, [load]);

  const onPickImage = async () => {
    if (pickingImage || sending) return;
    setPickingImage(true);
    try {
      const result = await pickSingleImageFromLibrary();
      const uri = result && !result.canceled ? result.assets[0]?.uri : null;
      if (uri) setPendingImageUri(uri);
    } catch (e) {
      Alert.alert('Could not open photos', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPickingImage(false);
    }
  };

  const onSend = async () => {
    const text = draft.trim();
    if ((!text && !pendingImageUri) || !token || sending) return;
    setSending(true);
    try {
      let imageUrl: string | undefined;
      if (pendingImageUri) {
        // Normalize to real JPEG bytes first — the server rejects a claimed image/jpeg upload
        // whose bytes don't actually match (e.g. HEIC straight from the photo library).
        const preparedUri = await prepareMessageImageForUpload(pendingImageUri);
        imageUrl = await uploadThreadImage(token, preparedUri);
      }
      const msg = await sendThreadMessage(token, threadId, text, imageUrl);
      setDraft('');
      setPendingImageUri(null);
      setMessages((prev) => [...prev, msg]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const onAcceptRequest = async () => {
    if (!token) return;
    try {
      await patchThreadAction(token, threadId, 'accept_request');
      await load();
    } catch (e) {
      Alert.alert('Could not accept', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const onThreadAction = (action: 'pin' | 'star' | 'mute' | 'block') => {
    if (!token || !thread) return;
    const next =
      action === 'pin' ? !thread.pinned : action === 'star' ? !thread.starred : action === 'mute' ? !thread.muted : true;
    void patchThreadAction(token, threadId, action, next)
      .then(() => (action === 'block' ? navigation.goBack() : load()))
      .catch((e) => {
        Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again.');
      });
  };

  const onBlock = () => {
    if (!thread) return;
    Alert.alert(`Block @${thread.otherUsername}?`, 'They will no longer be able to message you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => onThreadAction('block') },
    ]);
  };

  const onDeleteConversation = () => {
    if (!token || !thread) return;
    Alert.alert(
      `Delete conversation with @${thread.otherUsername}?`,
      'It moves to Deleted for 14 days, then is removed for good. They keep their own copy, and you can restore it before then.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void patchThreadAction(token, threadId, 'delete', true)
              .then(() => navigation.goBack())
              .catch((e) => Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.'));
          },
        },
      ],
    );
  };

  const onRestoreConversation = () => {
    if (!token) return;
    void patchThreadAction(token, threadId, 'delete', false)
      .then(() => load())
      .catch((e) => Alert.alert('Could not restore', e instanceof Error ? e.message : 'Try again.'));
  };

  const onOpenMenu = () => {
    if (!thread) return;
    Alert.alert(`@${thread.otherUsername}`, undefined, [
      { text: thread.pinned ? 'Unpin conversation' : 'Pin conversation', onPress: () => onThreadAction('pin') },
      { text: thread.starred ? 'Remove star' : 'Star conversation', onPress: () => onThreadAction('star') },
      { text: thread.muted ? 'Unmute notifications' : 'Mute notifications', onPress: () => onThreadAction('mute') },
      thread.deleted
        ? { text: 'Restore conversation', onPress: onRestoreConversation }
        : { text: 'Delete conversation', style: 'destructive', onPress: onDeleteConversation },
      { text: 'Block', style: 'destructive', onPress: onBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openProfile = () => {
    if (thread?.otherUserId) navigation.navigate('UserProfile', { userId: thread.otherUserId });
  };

  const uid = user?.id ?? '';
  // The initiator of a request-folder thread can send exactly the first message; the server blocks
  // follow-ups (403) until the recipient accepts. Show a clear waiting state instead of an enabled
  // composer that fails with a generic "Send failed".
  const awaitingAcceptance = thread?.inbox === 'request' && !thread.isSeller;
  const viewState = deriveMessageThreadViewState({ loading, hasThread: !!thread, hasError: !!loadError });
  const rows = useMemo(() => buildThreadRows(messages, uid), [messages, uid]);
  const isRequestRecipient = thread?.inbox === 'request' && !!thread.isSeller;

  if (viewState === 'loading') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (viewState === 'error') {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingHorizontal: spacing.lg }]}>
        <Pressable style={styles.backFloating} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.errorWrap}>
          <PremiumEmptyPanel
            icon="cloud-offline-outline"
            title="Couldn't load this conversation"
            subtitle={loadError ?? 'Something went wrong. Try again.'}
            actions={[{ label: 'Retry', onPress: onRetryLoad }]}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={openProfile} style={styles.headerPerson} accessibilityRole="button" accessibilityLabel="View profile">
          <UserAvatar
            uri={thread?.otherAvatarUrl}
            username={thread?.otherUsername}
            size={42}
            cornerRadius={13}
            tone="light"
            borderColor="rgba(212,175,55,0.55)"
            borderWidth={1.5}
          />
          <View style={styles.headerMid}>
            <Text style={styles.headerUser} numberOfLines={1}>
              @{thread?.otherUsername ?? '…'}
            </Text>
            <MessagePersonBadges sellerLevelLabel={thread?.otherSellerLevelLabel} verified={thread?.otherVerified} />
          </View>
        </Pressable>
        <Pressable onPress={openProfile} hitSlop={6} style={styles.iconBtn} accessibilityLabel="View profile">
          <Ionicons name="person-outline" size={22} color="#9B9B9B" />
        </Pressable>
        <Pressable onPress={onOpenMenu} hitSlop={6} style={styles.iconBtn} accessibilityLabel="More options">
          <Ionicons name="ellipsis-horizontal" size={22} color="#9B9B9B" />
        </Pressable>
      </View>

      {thread?.deleted ? (
        <View style={styles.deletedBar}>
          <Text style={styles.deletedBarTxt}>In Deleted. It will be removed for good after 14 days.</Text>
          <Pressable onPress={onRestoreConversation} hitSlop={8} accessibilityRole="button" accessibilityLabel="Restore conversation">
            <Text style={styles.deletedBarBtn}>Restore</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList<ThreadListRow>
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) =>
          item.type === 'day' ? (
            <Text style={styles.dayLabel}>{item.label}</Text>
          ) : (
            <MessageBubble
              message={item.message}
              isMine={item.isMine}
              firstInGroup={item.firstInGroup}
              lastInGroup={item.lastInGroup}
              timeLabel={item.timeLabel}
              showStatus={item.showStatus}
              onPressMentionUser={(userId) => navigation.navigate('UserProfile', { userId })}
            />
          )
        }
        ListFooterComponent={
          isRequestRecipient ? (
            <View style={styles.requestCard}>
              <View style={styles.requestCopy}>
                <Text style={styles.requestKicker}>Message request</Text>
                <Text style={styles.requestBody}>
                  @{thread?.otherUsername} wants to message you. Accept to move this conversation to your inbox.
                </Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable style={styles.requestAccept} onPress={() => void onAcceptRequest()} accessibilityRole="button">
                  <Text style={styles.requestAcceptTxt}>Accept</Text>
                </Pressable>
                <Pressable style={styles.requestBlock} onPress={onBlock} accessibilityRole="button">
                  <Text style={styles.requestBlockTxt}>Block</Text>
                </Pressable>
              </View>
              <Text style={styles.requestHint}>Replying also accepts the request.</Text>
            </View>
          ) : null
        }
      />

      {awaitingAcceptance ? (
        <View style={[styles.pendingBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Ionicons name="paper-plane-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.pendingTxt}>
            Message request sent. You can reply once @{thread?.otherUsername ?? 'they'} accepts — or after they message you back.
          </Text>
        </View>
      ) : (
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {pendingImageUri ? (
            <View style={styles.imagePreviewRow}>
              <Image source={{ uri: pendingImageUri }} style={styles.imagePreview} contentFit="cover" />
              <Pressable onPress={() => setPendingImageUri(null)} hitSlop={10} style={styles.imagePreviewRemove}>
                <Ionicons name="close-circle" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <Pressable
              style={styles.attach}
              onPress={() => void onPickImage()}
              disabled={pickingImage || sending}
              accessibilityRole="button"
              accessibilityLabel="Attach photo"
            >
              {pickingImage ? (
                <ActivityIndicator color="#9B9B9B" size="small" />
              ) : (
                <Ionicons name="image-outline" size={22} color="#9B9B9B" />
              )}
            </Pressable>
            <MentionComposerInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              accessToken={token}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[styles.send, !draft.trim() && !pendingImageUri && styles.sendDim]}
              onPress={() => void onSend()}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color={colors.background} />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  deletedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.10)',
  },
  deletedBarTxt: { flex: 1, fontSize: 13, color: '#9B9B9B', lineHeight: 18 },
  deletedBarBtn: { fontFamily: vaultFonts.label, fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', color: colors.gold },
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  backFloating: { alignSelf: 'flex-start', padding: 4, marginBottom: spacing.md },
  errorWrap: { flex: 1, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.10)',
  },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerPerson: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMid: { flex: 1, minWidth: 0, gap: 2 },
  headerUser: { fontFamily: vaultFonts.display, fontSize: 18, lineHeight: 20, color: colors.textPrimary },
  dayLabel: {
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: vaultFonts.label,
    fontSize: 12,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: '#6E6E6E',
  },
  messages: { paddingTop: spacing.sm, paddingBottom: spacing.md, flexGrow: 1, justifyContent: 'flex-end' },
  requestCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    gap: 14,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  requestCopy: { gap: 4 },
  requestKicker: {
    fontFamily: vaultFonts.label,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#9B9B9B',
  },
  requestBody: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestAccept: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAcceptTxt: {
    fontFamily: vaultFonts.label,
    fontSize: 17,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.background,
  },
  requestBlock: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,59,48,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBlockTxt: {
    fontFamily: vaultFonts.label,
    fontSize: 17,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#FF6B61',
  },
  requestHint: { fontSize: 12, color: '#9B9B9B', textAlign: 'center' },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.10)',
    backgroundColor: colors.background,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.sm,
    paddingTop: 10,
  },
  attach: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  imagePreviewRow: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  imagePreview: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#161616' },
  imagePreviewRemove: {
    position: 'absolute',
    top: -6,
    left: 64,
    backgroundColor: 'rgba(5,5,5,0.9)',
    borderRadius: 11,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.30)',
    backgroundColor: '#0F0F0F',
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.textPrimary,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDim: { opacity: 0.45 },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.10)',
    backgroundColor: colors.background,
  },
  pendingTxt: { flex: 1, fontSize: 13, color: '#9B9B9B' },
});
