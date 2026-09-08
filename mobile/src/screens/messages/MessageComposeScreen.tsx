import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentionComposerInput } from '../../components/mentions/MentionComposerInput';
import { sendThreadMessage, startConversation, uploadThreadImage } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import {
  pickPhotoFromCamera,
  pickPhotosFromLibrary,
  promptPhotoPickSource,
} from '../../createListing/pickListingMedia';
import { prepareMessageImageForUpload } from '../../lib/messageImagePrepare';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageCompose'>;

/** Matches the common messaging-app ceiling (iMessage/WhatsApp) — generous without being unbounded. */
const MAX_MESSAGE_IMAGES = 10;

export function MessageComposeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const [draft, setDraft] = useState(route.params.initialDraft ?? '');
  const [busy, setBusy] = useState(false);
  const [pendingImageUris, setPendingImageUris] = useState<string[]>([]);
  const [pickingImage, setPickingImage] = useState(false);

  const sellerLabel = route.params.sellerUsername?.trim();
  const profileTarget = route.params.sellerUserId?.trim();
  const title = sellerLabel
    ? `Message @${sellerLabel.replace(/^@/, '')}`
    : profileTarget
      ? 'Message collector'
      : 'Message seller';
  const fromLive = Boolean(route.params.liveRoomId);
  const fromProfile = Boolean(profileTarget && !route.params.listingId && !route.params.liveRoomId);

  const onPickImage = async () => {
    if (pickingImage || busy) return;
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

  const removePendingImage = (uri: string) => {
    setPendingImageUris((prev) => prev.filter((u) => u !== uri));
  };

  const onSend = async () => {
    const text = draft.trim();
    if (!text && pendingImageUris.length === 0) {
      Alert.alert('Message', 'Write a note or attach a photo before sending.');
      return;
    }
    if (!token) {
      Alert.alert('Sign in', 'Sign in to message collectors.');
      return;
    }
    setBusy(true);
    try {
      // Only one image can ride along with the thread-starting call — any additional images go
      // out as follow-up messages once the thread exists. Caption text always lands on the very
      // last image (or as the opening message body when there's no image at all).
      const queued = [...pendingImageUris];
      const firstUri = queued.shift();
      let firstImageUrl: string | undefined;
      if (firstUri) {
        const preparedUri = await prepareMessageImageForUpload(firstUri);
        firstImageUrl = await uploadThreadImage(token, preparedUri);
      }
      const { threadId, inbox } = await startConversation(token, {
        listingId: route.params.listingId,
        liveRoomId: route.params.liveRoomId,
        sellerUserId: profileTarget,
        body: queued.length === 0 ? text : '',
        imageUrl: firstImageUrl,
        conversationKind: fromLive ? 'live_networking' : 'buyer_seller',
      });
      for (let i = 0; i < queued.length; i += 1) {
        const isLast = i === queued.length - 1;
        const preparedUri = await prepareMessageImageForUpload(queued[i]);
        const imageUrl = await uploadThreadImage(token, preparedUri);
        await sendThreadMessage(token, threadId, isLast ? text : '', imageUrl);
      }
      Keyboard.dismiss();
      if (inbox === 'request') {
        Alert.alert(
          'Request sent',
          'Your message is in their requests until they accept.',
          [{ text: 'OK', onPress: () => navigation.replace('MessageThread', { threadId }) }],
        );
        return;
      }
      navigation.replace('MessageThread', { threadId });
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.hint}>
          {fromLive
            ? 'Private message — stays off the live chat.'
            : fromProfile
              ? 'Direct message — private conversation on Get Vaulted.'
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

        {pendingImageUris.length > 0 ? (
          <View style={styles.imagePreviewWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagePreviewRow}>
              {pendingImageUris.map((uri) => (
                <View key={uri} style={styles.imagePreviewItem}>
                  <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" />
                  <Pressable onPress={() => removePendingImage(uri)} hitSlop={10} style={styles.imagePreviewRemove}>
                    <Ionicons name="close-circle" size={22} color={colors.textPrimary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            {pendingImageUris.length < MAX_MESSAGE_IMAGES ? (
              <Pressable
                style={styles.attachRow}
                onPress={() => void onPickImage()}
                disabled={pickingImage || busy}
                accessibilityRole="button"
                accessibilityLabel="Attach another photo"
              >
                {pickingImage ? (
                  <ActivityIndicator color={colors.textSecondary} size="small" />
                ) : (
                  <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
                )}
                <Text style={styles.attachTxt}>Add another photo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            style={styles.attachRow}
            onPress={() => void onPickImage()}
            disabled={pickingImage || busy}
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
          >
            {pickingImage ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
            )}
            <Text style={styles.attachTxt}>Attach photo</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={[styles.send, ((!draft.trim() && pendingImageUris.length === 0) || busy) && styles.sendDim]}
          onPress={() => void onSend()}
          disabled={busy || (!draft.trim() && pendingImageUris.length === 0)}
          accessibilityLabel="Send message"
        >
          {busy ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.sendTxt}>Send message</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.md },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: 6,
  },
  attachTxt: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  imagePreviewWrap: { marginTop: spacing.md },
  imagePreviewRow: { flexDirection: 'row', gap: spacing.sm },
  imagePreviewItem: { position: 'relative' },
  imagePreview: { width: 84, height: 84, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  imagePreviewRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(10,10,10,0.9)',
    borderRadius: 11,
  },
  input: {
    minHeight: 160,
    maxHeight: 240,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(8,8,10,0.98)',
  },
  send: {
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  sendDim: { opacity: 0.45 },
  sendTxt: { fontWeight: '900', fontSize: 15, color: '#0a0a0a' },
});
