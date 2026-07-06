import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { MentionComposerInput } from '../../components/mentions/MentionComposerInput';
import { MessageBubble } from '../../components/messages/MessageBubble';
import { MessageContextBanner } from '../../components/messages/MessageContextBanner';
import { PremiumEmptyPanel } from '../../components/empty/PremiumEmptyPanel';
import type { RootStackParamList } from '../../navigation/types';
import type { ThreadDetail, ThreadMessage } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';
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

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !token || sending) return;
    setSending(true);
    try {
      const msg = await sendThreadMessage(token, threadId, text);
      setDraft('');
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

  const onSellerAction = (action: 'pin' | 'star' | 'mute' | 'block') => {
    if (!token || !thread) return;
    const next =
      action === 'pin' ? !thread.pinned : action === 'star' ? !thread.starred : action === 'mute' ? !thread.muted : true;
    void patchThreadAction(token, threadId, action, next).then(load).catch((e) => {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again.');
    });
  };

  const uid = user?.id ?? '';
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
            if (!thread?.isSeller) return;
            Alert.alert('Collector tools', undefined, [
              { text: 'Star buyer', onPress: () => onSellerAction('star') },
              { text: thread.pinned ? 'Unpin' : 'Pin', onPress: () => onSellerAction('pin') },
              { text: thread.muted ? 'Unmute' : 'Mute', onPress: () => onSellerAction('mute') },
              { text: 'Block', style: 'destructive', onPress: () => onSellerAction('block') },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {thread?.inbox === 'request' && thread.isSeller ? (
        <Pressable style={styles.acceptBar} onPress={() => void onAcceptRequest()}>
          <Text style={styles.acceptTxt}>Accept message request</Text>
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
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMine={item.senderId === uid}
            onPressMentionUser={(userId) => navigation.navigate('UserProfile', { userId })}
          />
        )}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
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
        <Pressable style={[styles.send, !draft.trim() && styles.sendDim]} onPress={() => void onSend()} disabled={sending}>
          {sending ? (
            <ActivityIndicator color="#0a0a0a" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#0a0a0a" />
          )}
        </Pressable>
      </View>
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(8,8,10,0.98)',
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
});
