import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
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
  hostAvatarUrl?: string | null;
  previewImageUrl?: string | null;
  thumbnailGradient?: [string, string];
  isLive?: boolean;
  accessToken?: string;
  canNotifyFollowers?: boolean;
  onToast?: (message: string) => void;
  onInAppShareSent?: () => void;
};

const ACTION_SIZE = 58;
const FRIEND_SIZE = 64;
const SHEET_BG = '#242424';
const ACTION_GREY = '#3a3a3a';
const MESSAGES_GREEN = '#34C759';

function smsShareUrl(url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  return Platform.OS === 'ios' ? `sms:&body=${text}%20${link}` : `sms:?body=${text}%20${link}`;
}

function xShareUrl(url: string, title: string, description: string): string {
  const text = encodeURIComponent(`${title}\n${description}`);
  const link = encodeURIComponent(url);
  return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
}

function BottomShareAction({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable style={styles.bottomActionItem} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {children}
      <Text style={styles.bottomActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function LiveRoomShareSheet({
  visible,
  onClose,
  roomId,
  showTitle,
  hostUsername,
  hostAvatarUrl,
  previewImageUrl,
  thumbnailGradient = ['#1a1a22', '#0a0a0d'],
  isLive = true,
  accessToken,
  canNotifyFollowers = false,
  onToast,
  onInAppShareSent,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - spacing.lg * 2, 360);

  const publicUrl = useMemo(() => canonicalLiveShareUrl(roomId) ?? '', [roomId]);
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState<AccountFollowUser[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');

  const hostHandle = hostUsername.replace(/^@+/, '').trim() || 'host';
  const previewUri = previewImageUrl?.trim() || null;

  const toast = useCallback((msg: string) => onToast?.(msg), [onToast]);

  const sharePack = useMemo(
    () =>
      buildSellerLiveShareMessage({
        hostUsername: hostHandle,
        showTitle,
        publicUrl,
        isLive,
      }),
    [hostHandle, isLive, publicUrl, showTitle],
  );

  useEffect(() => {
    if (!visible) {
      setCopied(false);
      setBusyUserId(null);
      setNotifyBusy(false);
      setSearchOpen(false);
      setFriendQuery('');
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

  const filteredFollowing = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) return following;
    return following.filter((u) => u.username.toLowerCase().includes(q));
  }, [following, friendQuery]);

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
      await shareLiveRoomNative({
        roomId,
        showTitle,
        hostUsername: hostHandle,
        isLive,
      });
    } catch {
      /* dismissed */
    }
  };

  const openSms = async () => {
    if (!publicUrl) return;
    const url = smsShareUrl(publicUrl, sharePack.title, sharePack.message.split('\n')[0] ?? showTitle);
    try {
      await Linking.openURL(url);
    } catch {
      toast('Could not open Messages.');
    }
  };

  const openX = async () => {
    if (!publicUrl) return;
    const url = xShareUrl(publicUrl, sharePack.title, sharePack.message.split('\n')[0] ?? showTitle);
    try {
      await Linking.openURL(url);
    } catch {
      toast('Could not open X.');
    }
  };

  const sendInApp = async (params: { recipientUserIds?: string[]; notifyFollowers?: boolean }) => {
    if (!accessToken) {
      toast('Sign in to share in Get Vaulted.');
      return;
    }
    try {
      const result = await shareLiveRoomInApp(accessToken, roomId, params);
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

  const openSearch = () => {
    if (!accessToken) {
      toast('Sign in to share with friends.');
      return;
    }
    setSearchOpen(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss share sheet" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={[styles.previewCard, { width: cardWidth }]}>
              <View style={styles.previewHostRow}>
                <UserAvatar uri={hostAvatarUrl} name={hostHandle} username={hostHandle} size={22} tone="light" />
                <Text style={styles.previewHostName} numberOfLines={1}>
                  {hostHandle}
                </Text>
              </View>

              <View style={styles.previewHero}>
                {previewUri ? (
                  <Image source={{ uri: previewUri }} style={styles.previewHeroImage} contentFit="cover" />
                ) : (
                  <LinearGradient colors={thumbnailGradient} style={StyleSheet.absoluteFill} />
                )}
                {isLive ? (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>Live</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.previewTitle} numberOfLines={3}>
                {showTitle}
                {isLive ? ' · Shop Live Now!' : ''}
              </Text>
            </View>

            {searchOpen && accessToken ? (
              <TextInput
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder="Search friends"
                placeholderTextColor="#888"
                autoFocus
                style={styles.searchInput}
                returnKeyType="search"
              />
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.friendsRow}
              style={styles.friendsScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable style={styles.friendItem} onPress={openSearch} accessibilityLabel="Search friends">
                <View style={[styles.friendCircle, styles.searchCircle]}>
                  <Ionicons name="search" size={26} color="#fff" />
                </View>
                <Text style={styles.friendLabel}>Search</Text>
              </Pressable>

              {canNotifyFollowers ? (
                <Pressable
                  style={styles.friendItem}
                  disabled={notifyBusy || Boolean(busyUserId)}
                  onPress={notifyFollowers}
                  accessibilityLabel="Notify followers"
                >
                  <View style={[styles.friendCircle, styles.notifyCircle]}>
                    {notifyBusy ? (
                      <ActivityIndicator color={colors.gold} size="small" />
                    ) : (
                      <Ionicons name="notifications" size={24} color={colors.gold} />
                    )}
                  </View>
                  <Text style={styles.friendLabel}>Followers</Text>
                </Pressable>
              ) : null}

              {accessToken && loadingFollowing ? (
                <View style={styles.friendItem}>
                  <View style={[styles.friendCircle, styles.searchCircle]}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                </View>
              ) : null}

              {accessToken
                ? filteredFollowing.map((user) => {
                    const sending = busyUserId === user.userId;
                    return (
                      <Pressable
                        key={user.userId}
                        style={styles.friendItem}
                        disabled={Boolean(busyUserId) || notifyBusy}
                        onPress={() => void sendToUser(user)}
                        accessibilityLabel={`Share with ${user.username}`}
                      >
                        <View style={styles.friendAvatarWrap}>
                          <UserAvatar
                            uri={user.image}
                            name={user.username}
                            username={user.username}
                            size={FRIEND_SIZE}
                            tone="dark"
                          />
                          {sending ? (
                            <View style={styles.friendSendingOverlay}>
                              <ActivityIndicator color="#fff" size="small" />
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.friendLabel} numberOfLines={1}>
                          {user.username}
                        </Text>
                      </Pressable>
                    );
                  })
                : null}
            </ScrollView>

            {!accessToken ? (
              <Text style={styles.signInHint}>Sign in to share with friends on Get Vaulted.</Text>
            ) : null}
          </ScrollView>

          <View style={styles.bottomActions}>
            <BottomShareAction label={copied ? 'Copied!' : 'Copy Link'} onPress={() => void copyLink()}>
              <View style={[styles.actionCircle, { backgroundColor: ACTION_GREY }]}>
                <Ionicons name={copied ? 'checkmark' : 'link'} size={24} color="#fff" />
              </View>
            </BottomShareAction>

            <BottomShareAction label="Messages" onPress={() => void openSms()}>
              <View style={[styles.actionCircle, { backgroundColor: MESSAGES_GREEN }]}>
                <Ionicons name="chatbubble" size={26} color="#fff" />
              </View>
            </BottomShareAction>

            <BottomShareAction label="X" onPress={() => void openX()}>
              <View style={[styles.actionCircle, styles.xCircle]}>
                <Ionicons name="logo-twitter" size={22} color="#000" />
              </View>
            </BottomShareAction>

            <BottomShareAction label="More" onPress={() => void nativeShare()}>
              <View style={[styles.actionCircle, { backgroundColor: ACTION_GREY }]}>
                <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
              </View>
            </BottomShareAction>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: SHEET_BG,
    paddingTop: spacing.sm,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginBottom: spacing.md,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  previewCard: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  previewHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  previewHostName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  previewHero: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
    marginBottom: spacing.sm,
  },
  previewHeroImage: { width: '100%', height: '100%' },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: '#fff',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.live,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    lineHeight: 20,
  },
  searchInput: {
    alignSelf: 'stretch',
    marginBottom: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  friendsScroll: {
    alignSelf: 'stretch',
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.md,
  },
  friendsRow: {
    paddingHorizontal: spacing.lg,
    gap: 14,
    alignItems: 'flex-start',
  },
  friendItem: {
    width: FRIEND_SIZE + 8,
    alignItems: 'center',
  },
  friendCircle: {
    width: FRIEND_SIZE,
    height: FRIEND_SIZE,
    borderRadius: FRIEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  searchCircle: { backgroundColor: ACTION_GREY },
  notifyCircle: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  friendAvatarWrap: {
    width: FRIEND_SIZE,
    height: FRIEND_SIZE,
    marginBottom: 6,
  },
  friendSendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FRIEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  friendLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    maxWidth: FRIEND_SIZE + 8,
  },
  signInHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomActionItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    maxWidth: 88,
  },
  actionCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xCircle: {
    backgroundColor: '#fff',
  },
  bottomActionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
});
