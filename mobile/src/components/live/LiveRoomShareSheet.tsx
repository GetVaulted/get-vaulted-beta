import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shareLiveRoomInApp } from '../../api/liveRoomShareRepository';
import { fetchAccountFollows, type AccountFollowUser } from '../../api/sellerFollowRepository';
import { shareLiveRoomNative } from '../../lib/shareLiveRoomNative';
import { buildSellerLiveShareMessage } from '../../lib/liveRoomShare';
import { canonicalLiveShareUrl } from '../../lib/liveShareUrl';
import { SELLER_CONSOLE } from '../../lib/sellerConsoleCopy';
import { UserAvatar } from '../ui/UserAvatar';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  showTitle: string;
  hostUsername: string;
  isLive?: boolean;
  accessToken?: string;
  /** Host/seller can notify all followers about this show. */
  canNotifyFollowers?: boolean;
  onToast?: (message: string) => void;
  onInAppShareSent?: () => void;
};

function socialShareUrl(platform: 'x' | 'facebook' | 'sms', url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  if (platform === 'x') return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
  if (platform === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
  return Platform.OS === 'ios' ? `sms:&body=${text}%20${link}` : `sms:?body=${text}%20${link}`;
}

export function LiveRoomShareSheet({
  visible,
  onClose,
  roomId,
  showTitle,
  hostUsername,
  isLive = true,
  accessToken,
  canNotifyFollowers = false,
  onToast,
  onInAppShareSent,
}: Props) {
  const insets = useSafeAreaInsets();
  const publicUrl = useMemo(() => canonicalLiveShareUrl(roomId) ?? '', [roomId]);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');
  const [following, setFollowing] = useState<AccountFollowUser[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const toast = useCallback((msg: string) => onToast?.(msg), [onToast]);

  const shareTitle = useMemo(() => buildSellerLiveShareMessage({
    hostUsername,
    showTitle,
    publicUrl,
    isLive,
  }).title, [hostUsername, isLive, publicUrl, showTitle]);

  const shareDescription = useMemo(
    () => buildSellerLiveShareMessage({ hostUsername, showTitle, publicUrl, isLive }).message.split('\n')[0] ?? showTitle,
    [hostUsername, isLive, publicUrl, showTitle],
  );

  useEffect(() => {
    if (!visible) {
      setCopied(false);
      setNote('');
      setBusyUserId(null);
      setNotifyBusy(false);
      return;
    }
    if (!accessToken) {
      setFollowing([]);
      return;
    }
    setLoadingFollowing(true);
    void fetchAccountFollows(accessToken)
      .then((data) => setFollowing(data?.following ?? []))
      .catch(() => setFollowing([]))
      .finally(() => setLoadingFollowing(false));
  }, [accessToken, visible]);

  const copyLink = async () => {
    if (!publicUrl) {
      toast('Share link unavailable.');
      return;
    }
    try {
      await Clipboard.setStringAsync(publicUrl);
      setCopied(true);
      toast('Link copied.');
    } catch {
      toast('Could not copy link.');
    }
  };

  const nativeShare = async () => {
    try {
      const shared = await shareLiveRoomNative({
        roomId,
        showTitle,
        hostUsername,
        isLive,
      });
      if (shared) onClose();
    } catch {
      /* dismissed */
    }
  };

  const openSocial = async (platform: 'x' | 'facebook' | 'sms') => {
    if (!publicUrl) return;
    const url = socialShareUrl(platform, publicUrl, shareTitle, shareDescription);
    try {
      await Linking.openURL(url);
    } catch {
      toast('Could not open share.');
    }
  };

  const sendInApp = async (params: { recipientUserIds?: string[]; notifyFollowers?: boolean }) => {
    if (!accessToken) {
      toast('Sign in to share in Get Vaulted.');
      return;
    }
    const trimmedNote = note.trim();
    try {
      const result = await shareLiveRoomInApp(accessToken, roomId, {
        ...params,
        note: trimmedNote || undefined,
      });
      if (result.sent <= 0) {
        toast('Could not deliver share.');
        return;
      }
      onInAppShareSent?.();
      toast(result.sent === 1 ? 'Shared in Get Vaulted.' : `Shared with ${result.sent} people.`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not share in app.');
    }
  };

  const sendToUser = async (user: AccountFollowUser) => {
    if (busyUserId) return;
    setBusyUserId(user.userId);
    try {
      await sendInApp({ recipientUserIds: [user.userId] });
    } finally {
      setBusyUserId(null);
    }
  };

  const notifyFollowers = () => {
    Alert.alert(
      SELLER_CONSOLE.notifyMyFollowers,
      'Send a Get Vaulted notification to everyone who follows you?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Notify',
          onPress: () => {
            void (async () => {
              setNotifyBusy(true);
              try {
                await sendInApp({ notifyFollowers: true });
              } finally {
                setNotifyBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss share sheet" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, maxHeight: '88%' }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{SELLER_CONSOLE.shareInApp}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {showTitle}
          </Text>

          {accessToken ? (
            <>
              <Text style={styles.sectionLabel}>{SELLER_CONSOLE.sendToFollowing}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors.textMuted}
                style={styles.noteInput}
                maxLength={280}
              />
              {loadingFollowing ? (
                <ActivityIndicator color={colors.gold} style={styles.loader} />
              ) : following.length === 0 ? (
                <Text style={styles.emptyFollowing}>Follow sellers to share shows with them here.</Text>
              ) : (
                <FlatList
                  data={following}
                  keyExtractor={(item) => item.userId}
                  style={styles.followingList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const sending = busyUserId === item.userId;
                    return (
                      <Pressable
                        style={({ pressed }) => [styles.followRow, pressed && styles.followRowPressed]}
                        disabled={Boolean(busyUserId) || notifyBusy}
                        onPress={() => void sendToUser(item)}
                      >
                        <UserAvatar uri={item.image} name={item.username} username={item.username} size={40} />
                        <Text style={styles.followName}>@{item.username}</Text>
                        {sending ? (
                          <ActivityIndicator color={colors.gold} size="small" />
                        ) : (
                          <Ionicons name="paper-plane-outline" size={18} color={colors.gold} />
                        )}
                      </Pressable>
                    );
                  }}
                />
              )}

              {canNotifyFollowers ? (
                <Pressable
                  style={[styles.notifyBtn, notifyBusy && styles.btnDisabled]}
                  disabled={notifyBusy || Boolean(busyUserId)}
                  onPress={notifyFollowers}
                >
                  {notifyBusy ? (
                    <ActivityIndicator color={colors.textPrimary} size="small" />
                  ) : (
                    <>
                      <Text style={styles.notifyBtnTxt}>{SELLER_CONSOLE.notifyMyFollowers}</Text>
                      <Text style={styles.notifyHint}>Alert everyone who follows you on Get Vaulted.</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.signInHint}>Sign in to share with people you follow inside Get Vaulted.</Text>
          )}

          <Text style={styles.sectionLabel}>{SELLER_CONSOLE.shareOutside}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void copyLink()}>
            <Text style={styles.primaryBtnTxt}>{SELLER_CONSOLE.copyLink}</Text>
            <Text style={styles.linkHint} numberOfLines={1}>
              {copied ? 'Copied' : publicUrl.replace(/^https?:\/\//, '')}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => void nativeShare()}>
            <Text style={styles.secondaryBtnTxt}>{SELLER_CONSOLE.nativeShare}</Text>
          </Pressable>

          <View style={styles.socialRow}>
            {(
              [
                ['X', 'x'],
                ['Facebook', 'facebook'],
                ['SMS', 'sms'],
              ] as const
            ).map(([label, platform]) => (
              <Pressable key={platform} style={styles.socialBtn} onPress={() => void openSocial(platform)}>
                <Text style={styles.socialBtnTxt}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
            <Text style={styles.closeBtnTxt}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  noteInput: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  followingList: { maxHeight: 180, marginBottom: spacing.sm },
  followRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  followRowPressed: { opacity: 0.75 },
  followName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  emptyFollowing: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  signInHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  loader: { marginVertical: spacing.md },
  notifyBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  notifyBtnTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  notifyHint: { marginTop: 2, fontSize: 11, color: colors.textMuted },
  btnDisabled: { opacity: 0.6 },
  primaryBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  primaryBtnTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  linkHint: { marginTop: 4, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  secondaryBtn: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  secondaryBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  socialRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  socialBtn: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(24,24,27,0.9)',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  socialBtnTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.88)',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: spacing.sm,
  },
  closeBtnTxt: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
});
