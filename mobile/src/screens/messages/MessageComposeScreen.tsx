import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentionComposerInput } from '../../components/mentions/MentionComposerInput';
import { startConversation } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import { openMessageThread } from '../../navigation/openMessages';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageCompose'>;

export function MessageComposeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const [draft, setDraft] = useState(route.params.initialDraft ?? '');
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    const text = draft.trim();
    if (!text) {
      Alert.alert('Message', 'Write a note to the seller.');
      return;
    }
    if (!token) {
      Alert.alert('Sign in', 'Sign in to message sellers.');
      return;
    }
    setBusy(true);
    try {
      const { threadId, inbox } = await startConversation(token, {
        listingId: route.params.listingId,
        liveRoomId: route.params.liveRoomId,
        body: text,
        conversationKind: route.params.liveRoomId ? 'live_networking' : 'buyer_seller',
      });
      if (inbox === 'request') {
        Alert.alert(
          'Request sent',
          'Your message is in the seller’s requests until they accept.',
        );
      }
      openMessageThread(navigation, threadId);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Message seller</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.hint}>
        {route.params.liveRoomId
          ? 'Private message — stays off the live chat.'
          : 'Ask about condition, shipping, or make an offer.'}
      </Text>
      <MentionComposerInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        accessToken={token}
        placeholder="Hi — I'm interested in this piece…"
        placeholderTextColor={colors.textMuted}
        multiline
        autoFocus
        maxLength={2000}
      />
      <Pressable style={styles.send} onPress={() => void onSend()} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={styles.sendTxt}>Send message</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.md },
  input: {
    flex: 1,
    minHeight: 140,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  send: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  sendTxt: { fontWeight: '900', fontSize: 15, color: '#0a0a0a' },
});
