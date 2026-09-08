import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import {
  pickPhotoFromCamera,
  pickPhotosFromLibrary,
  promptPhotoPickSource,
} from '../../createListing/pickListingMedia';
import { prepareMessageImageForUpload } from '../../lib/messageImagePrepare';
import { MentionComposerInput } from '../../components/mentions/MentionComposerInput';
import { MessageBubble } from '../../components/messages/MessageBubble';
import { MessageContextBanner } from '../../components/messages/MessageContextBanner';
import { PremiumEmptyPanel } from '../../components/empty/PremiumEmptyPanel';
import type { RootStackParamList } from '../../navigation/types';
import type { ThreadDetail, ThreadMessage } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';
import { deriveMessageThreadViewState, describeThreadLoadError } from './messageThreadViewState';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageThread'>;

/** Matches the common messaging-app ceiling (iMessage/WhatsApp) — generous without being unbounded. */
const MAX_MESSAGE_IMAGES = 10;

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
  const [pendingImageUris, setPendingImageUris] = useState<string[]>([]);
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
    const remaining = MAX_MESSAGE_IMAGES - pendingImageUris.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_MESSAGE_IMAGES} photos to one message.`);
      return;
    }
    const source = await promptPhotoPickSource('Add photo');
    if (!source) return;
    setPickingImage(true);
    try {
      if (source === 'camera') {
        const result = await pickPhotoFromCamera();
        const uri = result && !result.canceled ? result.assets[0]?.uri : null;
        if (uri) setPendingImageUris((prev) => [...prev, uri].slice(0, MAX_MESSAGE_IMAGES));
      } else {
        const result = await pickPhotosFromLibrary(remaining);
        const uris = result && !result.canceled ? result.assets.map((a) => a.uri).filter(Boolean) : [];
        if (uris.length) {
          setPendingImageUris((prev) => [...prev, ...uris].slice(0, MAX_MESSAGE_IMAGES));
        }
      }
    } catch (e) {
      Alert.alert('Could not open photos', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPickingImage(false);
    }
  };

  const removePendingImage = useCallback((uri: string) => {
    setPendingImageUris((prev) => prev.filter((u) => u !== uri));
  }, []);

  const onSend = async () => {
    const text = draft.trim();
    if ((!text && pendingImageUris.length === 0) || !token || sending) return;
    setSending(true);
    try {
      const queued = [...pendingImageUris];
      // Multiple photos become multiple messages (no multi-image message row in the schema today)
      // — every image but the last is sent image-only, and the typed caption (if any) rides along
      // with the last one instead of landing as a separate, disconnected text bubble.
      for (let i = 0; i < queued.length; i += 1) {
        const uri = queued[i];
        const isLast = i === queued.length - 1;
        // Normalize to real JPEG bytes first — the server rejects a claimed image/jpeg upload
        // whose bytes don't actually match (e.g. HEIC straight from the photo library).
        const preparedUri = await prepareMessageImageForUpload(uri);
        const imageUrl = await uploadThreadImage(token, preparedUri);
        const msg = await sendThreadMessage(token, threadId, isLast ? text : '', imageUrl);
        setMessages((prev) => [...prev, msg]);
        removePendingImage(uri);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
      if (queued.length === 0) {
        const msg = await sendThreadMessage(token, threadId, text);
        setMessages((prev) => [...prev, msg]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
      setDraft('');
    } catch (e) {
      // Anything already sent this call stays sent (and out of pendingImageUris via
      // removePendingImage above) — only the images that didn't go out yet remain queued to retry.
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

  const onSellerAction = (action: 'pin' | 'star' | 'mute' | 'block') => {
    if (!token || !thread) return;
    const next =
      action === 'pin' ? !thread.pinned : action === 'star' ? !thread.starred : action === 'mute' ? !thread.muted : true;
    void patchThreadAction(token, threadId, action, next).then(load).catch((e) => {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again.');
    });
  };

  // Delete-for-me: moves the conversation into this user's Trash (14-day undo window via
  // MessagesInboxScreen), with zero effect on the other participant's copy. Available to either
  // side of the conversation, not just the seller.
  const onDeleteThread = () => {
    if (!token) return;
    void patchThreadAction(token, threadId, 'delete')
      .then(() => navigation.goBack())
      .catch((e) => {
        Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
      });
  };

  const uid = user?.id ?? '';
  // The initiator of a request-folder thread can send exactly the first message; the server blocks
  // follow-ups (403) until the recipient accepts. Show a clear waiting state instead of an enabled
  // composer that fails with a generic "Send failed".
  const awaitingAcceptance = thread?.inbox === 'request' && !thread.isSeller;
  const viewState = deriveMessageThreadViewState({ loading, hasThread: !!thread, hasError: !!loadError });

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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.headerUser}>@{thread?.otherUsername ?? '…'}</Text>
          <Text style={styles.headerSub}>{thread?.conversationLabel}</Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => {
            if (!thread) return;
            const sellerOptions = thread.isSeller
              ? [
                  { text: 'Star buyer', onPress: () => onSellerAction('star') },
                  { text: thread.pinned ? 'Unpin' : 'Pin', onPress: () => onSellerAction('pin') },
                  { text: thread.muted ? 'Unmute' : 'Mute', onPress: () => onSellerAction('mute') },
                  { text: 'Block', style: 'destructive' as const, onPress: () => onSellerAction('block') },
                ]
              : [];
            Alert.alert('Collector tools', undefined, [
              ...sellerOptions,
              { text: 'Delete conversation', style: 'destructive' as const, onPress: onDeleteThread },
              { text: 'Cancel', style: 'cancel' as const },
            ]);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {thread?.inbox === 'request' && thread.isSeller ? (
        <Pressable style={styles.acceptBar} onPress={() => void onAcceptRequest()}>
          <Text style={styles.acceptTxt}>Accept request (or just reply)</Text>
        </Pressable>
      ) : null}

      {thread ? (
        <MessageContextBanner
          thread={thread}
          onViewListing={() => navigation.navigate('ProductDetail', { productId: thread.listingId })}
          onQuickAction={(a) => {
            if (a === 'live' && thread.liveRoomId) {
              navigation.navigate('MainTabs', {
                screen: 'Live',
                params: { screen: 'LiveRoom', params: { streamId: thread.liveRoomId } },
              });
            }
          }}
        />
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            isMine={item.senderId === uid}
            // Only the most recent message you sent shows "Sent"/"Read" — matches the
            // standard iMessage/WhatsApp convention instead of a status line under every bubble.
            showStatus={index === messages.length - 1}
            onPressMentionUser={(userId) => navigation.navigate('UserProfile', { userId })}
          />
        )}
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
          {pendingImageUris.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imagePreviewRow}
              contentContainerStyle={styles.imagePreviewRowContent}
            >
              {pendingImageUris.map((uri) => (
                <View key={uri} style={styles.imagePreviewItem}>
                  <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" />
                  <Pressable
                    onPress={() => removePendingImage(uri)}
                    hitSlop={10}
                    style={styles.imagePreviewRemove}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.textPrimary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.composer}>
            <Pressable
              style={styles.attach}
              onPress={() => void onPickImage()}
              disabled={pickingImage || sending || pendingImageUris.length >= MAX_MESSAGE_IMAGES}
              accessibilityRole="button"
              accessibilityLabel="Attach photo"
            >
              {pickingImage ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : (
                <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
              )}
            </Pressable>
            <MentionComposerInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              accessToken={token}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[styles.send, !draft.trim() && pendingImageUris.length === 0 && styles.sendDim]}
              onPress={() => void onSend()}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#0a0a0a" />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  backFloating: { alignSelf: 'flex-start', padding: 4, marginBottom: spacing.md },
  errorWrap: { flex: 1, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerMid: { flex: 1 },
  headerUser: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  acceptBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  acceptTxt: { fontWeight: '900', fontSize: 13, color: '#0a0a0a' },
  messages: { paddingVertical: spacing.sm, flexGrow: 1 },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(8,8,10,0.98)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  attach: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  imagePreviewRow: {
    paddingTop: spacing.sm,
  },
  imagePreviewRowContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  imagePreviewItem: {
    position: 'relative',
  },
  imagePreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  imagePreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(10,10,10,0.9)',
    borderRadius: 11,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(8,8,10,0.98)',
  },
  pendingTxt: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
});
