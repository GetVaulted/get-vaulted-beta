import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../theme';
import { fetchLiveRoomPublicById } from '../../api/liveRoomsRepository';
import { fetchProfileById } from '../../api/profilesRepository';
import { applyLiveModerationAction } from '../../api/trustRepository';
import { fetchLiveBuyerPaymentSession } from '../../api/liveBuyerPaymentRepository';
import { fetchSellerFollowStatus, toggleSellerFollow } from '../../api/sellerFollowRepository';
import type { LiveStream, ChatMessage } from '../../types';
import type { LiveStackParamList } from '../../navigation/types';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { openLiveHostProfile, openUserProfile } from '../../navigation/openPlatform';
import { UserAvatar } from '../ui/UserAvatar';
import { LiveAuctionSoldCelebration } from './LiveAuctionSoldCelebration';
import { LiveSpotTakenCelebration } from './LiveSpotTakenCelebration';
import { VaultRevealOverlay } from './VaultRevealOverlay';
import { LiveGiveawaySideTab } from './LiveGiveawaySideTab';
import { useLiveImmersiveChrome } from '../../hooks/useLiveImmersiveChrome';
import {
  CHAT_ABOVE_COMPOSER_GAP,
  COMPOSER_BAR_HEIGHT,
  computeChatStackMaxHeight,
  computeLiveRoomBottomStack,
  DEFAULT_COMMERCE_OVERLAY_HEIGHT,
} from '../../lib/liveRoomBottomLayout';
import { useLiveRoomChat } from '../../hooks/useLiveRoomChat';
import { liveRoomChatOpen } from '../../lib/liveRoomChatPolicy';
import { useLiveRoomRealtimeSession } from '../../hooks/useLiveRoomRealtimeSession';
import { BreakDisclaimerModal, breakDisclaimerStorageKey, readBreakDisclaimerAccepted, writeBreakDisclaimerAccepted } from './BreakDisclaimerModal';
import { resolvePinnedModeratorUsername } from '../../lib/resolvePinnedModeratorUsername';
import { useLiveRoomModeration } from '../../hooks/useLiveRoomModeration';
import { useLiveChatSlowMode } from '../../hooks/useLiveChatSlowMode';
import { slowModeComposerPlaceholder } from '../../lib/liveChatSlowMode';
import { resolveModerationActor, showModeratorTools } from '../../lib/liveModeratorPermissions';
import { LiveChatSlowModeTimer } from './LiveChatSlowModeTimer';
import { ModeratorActionSheet } from '../moderator/ModeratorActionSheet';
import { ModeratorDrawer } from '../moderator/ModeratorDrawer';
import {
  ModeratorToolsButton,
} from '../moderator/ModeratorFloatingButton';
import { ReportSheet } from '../trust/ReportSheet';
import {
  FloatingChatComposer,
  FloatingLiveChat,
  PinnedModeratorBar,
} from './floatingLiveChat';
import type { MentionComposerInputHandle } from '../mentions/MentionComposerInput';
import { appendMentionToDraft, canShowLiveChatBanOption, canShowLiveChatKickOption, promptLiveChatUserAction } from '../../lib/liveChatUserActions';
import { LiveBuyerShopSheet } from './LiveBuyerShopSheet';
import { LiveCustomBidSheet } from './LiveCustomBidSheet';
import { LiveTipSheet } from './LiveTipSheet';
import { LivePinnedActionBar } from './LivePinnedActionBar';
import { LivePaymentFailureModal } from './LivePaymentFailureModal';
import { LiveBuyerWalletGateModal } from './LiveBuyerWalletGateModal';
import { WalletSheet } from '../wallet/WalletSheet';
import { PAYMENT_RECOVERY_SUCCESS_TOAST } from '../../lib/livePaymentFailureCopy';
import {
  isWalletIncompleteReadiness,
  type BuyerWalletReadiness,
} from '../../lib/buyerWalletErrors';
import { buyerWalletGatePromptBody } from '../../lib/buyerWalletReadinessDisplay';
import { LiveEmptyBroadcastBlock } from './LiveEmptyBroadcastBlock';
import { LiveStagePlayback } from './LiveStagePlayback';
import { LiveRoomText } from './LiveRoomText';
import { LiveBadge } from '../ui/LiveBadge';
import { KeyboardDismissStageShield } from '../ui/KeyboardDismissStageShield';
import {
  computeLiveStageContainer,
  computeLiveStageHostStyle,
  computeLiveStageRootStyle,
  computeLiveStageSafeInsets,
  computeLiveTopReserve,
  computeGiveawaySideTabTop,
  LIVE_STAGE_CONTENT_FIT,
  logLiveStageLayoutDebug,
  type LiveStageContainer,
} from '../../lib/liveRoomViewport';
import { isCompactLiveRoomLayout, liveRoomOverlayScale } from '../../lib/liveRoomUiScale';
import { scaledComposerBarHeight } from '../../lib/liveRoomBottomLayout';
import { LiveRoomShareSheet } from './LiveRoomShareSheet';
import { prefetchLiveStreamRooms } from '../../lib/liveStreamPrefetchCache';
import type { LivePlaybackMode } from '../../hooks/useLiveStagePlayback';
import type { LiveRoomLineupItemSnapshot } from '../../lib/liveBuyerQueueProjection';
import { liveAuctionMinBidUsd } from '../../lib/liveAuctionPricing';
import { placeLiveRoomPreBid } from '../../api/liveRoomBuyerRepository';
import { purchaseLiveBuyNow, syncLiveBuyNowPurchase } from '../../api/liveBuyNowRepository';
import { mapLivePaymentFailureMessage } from '../../lib/livePaymentFailureCopy';
import { LiveBidNoticeToast } from './LiveBidNoticeToast';
import type { LiveBidFailureDisplay } from '../../lib/liveBidUserErrors';

function chatRightEdgeForWidth(layoutWidth: number): number {
  if (layoutWidth >= 768) return Math.round(92 * liveRoomOverlayScale(layoutWidth));
  return isCompactLiveRoomLayout(layoutWidth) ? 84 : 92;
}

type Props = {
  streams: LiveStream[];
  initialStreamId?: string;
  /** Bumps when the live room screen is focused again (new visit). */
  roomVisitNonce?: number;
  /** Minimal back control — rendered inside the stream header when provided. */
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  accessToken?: string;
  userId?: string;
};

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

type WalletGateHostSnapshot = {
  readiness: BuyerWalletReadiness;
  showModal: boolean;
  showSheet: boolean;
  roomId: string;
  accessToken: string;
};

type WalletGateHostActions = {
  openSheet: () => void;
  closeSheet: () => void;
  leaveRoom: () => void;
  onReadinessChange: (next: BuyerWalletReadiness) => void;
};

type LiveSpotCelebrationHost = {
  celebration: import('../../lib/liveSpotCelebration').LiveSpotTakenCelebration;
  viewerUsername?: string | null;
  clear: () => void;
};

function walletGateHostSnapshotsEqual(
  a: WalletGateHostSnapshot | null,
  b: WalletGateHostSnapshot | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.roomId === b.roomId &&
    a.accessToken === b.accessToken &&
    a.showModal === b.showModal &&
    a.showSheet === b.showSheet &&
    a.readiness.paymentReady === b.readiness.paymentReady &&
    a.readiness.shippingReady === b.readiness.shippingReady
  );
}

function LiveSlide({
  stream,
  isActive,
  playbackMode,
  stageContainer,
  screenHeight,
  onBack,
  signedIn = true,
  onRequireAuth,
  accessToken,
  userId,
  onWalletOverlayChange,
  onPaymentBlockerChange,
  onWalletGateHostChange,
  roomVisitNonce = 0,
  onSpotCelebrationHostChange,
}: {
  stream: LiveStream;
  isActive: boolean;
  playbackMode: LivePlaybackMode;
  stageContainer: LiveStageContainer;
  screenHeight: number;
  onBack?: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  accessToken?: string;
  userId?: string;
  onWalletOverlayChange?: (active: boolean) => void;
  onPaymentBlockerChange?: (active: boolean) => void;
  onWalletGateHostChange?: (
    snapshot: WalletGateHostSnapshot | null,
    actions: WalletGateHostActions | null,
  ) => void;
  roomVisitNonce?: number;
  onSpotCelebrationHostChange?: (host: LiveSpotCelebrationHost | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const stageInsets = computeLiveStageSafeInsets(stageContainer, screenHeight, insets, spacing.sm);
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const openWalletRef = useRef<(reason?: string) => void>(() => {});
  const layoutWidth = stageContainer.designWidth;
  const compact = isCompactLiveRoomLayout(layoutWidth);
  const overlayScale = liveRoomOverlayScale(layoutWidth);
  const railIconSize = overlayScale > 1 ? Math.round(22 * overlayScale) : 22;
  const railLabelSize = overlayScale > 1 ? Math.round(9 * overlayScale) : 9;
  const chatRightEdge = chatRightEdgeForWidth(layoutWidth);
  const [following, setFollowing] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [preBidItem, setPreBidItem] = useState<LiveRoomLineupItemSnapshot | null>(null);
  const [preBidBusy, setPreBidBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [roomPaymentMethodId, setRoomPaymentMethodId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportChatMessage, setReportChatMessage] = useState<ChatMessage | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [streamMuted, setStreamMuted] = useState(true);
  const [streamRefreshNonce, setStreamRefreshNonce] = useState(0);
  const [roomStatus, setRoomStatus] = useState(stream.roomStatus);
  const [commerceHeight, setCommerceHeight] = useState(DEFAULT_COMMERCE_OVERLAY_HEIGHT);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [breakDisclaimerAccepted, setBreakDisclaimerAccepted] = useState(true);
  const [breakDisclaimerReady, setBreakDisclaimerReady] = useState(false);
  const [walletReadiness, setWalletReadiness] = useState<BuyerWalletReadiness | null>(null);
  const [walletGateSheetOpen, setWalletGateSheetOpen] = useState(false);
  const [paymentRecoveryToast, setPaymentRecoveryToast] = useState<string | null>(null);
  const [bidNotice, setBidNotice] = useState<LiveBidFailureDisplay | null>(null);
  const bidNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [modActionMessage, setModActionMessage] = useState<ChatMessage | null>(null);
  const [myChatSender, setMyChatSender] = useState<{ username?: string; avatarUrl?: string | null }>({});
  const chatComposerRef = useRef<MentionComposerInputHandle>(null);

  useEffect(() => {
    if (!isActive) return;
    setWalletGateSheetOpen(false);
    setWalletReadiness(null);
  }, [isActive, roomVisitNonce, stream.id]);

  const leaveRoomSafely = useCallback(() => {
    setWalletGateSheetOpen(false);
    onPaymentBlockerChange?.(false);
    onWalletGateHostChange?.(null, null);
    requestAnimationFrame(() => {
      if (stackNav.canGoBack()) {
        stackNav.goBack();
        return;
      }
      onBack?.();
    });
  }, [onBack, onPaymentBlockerChange, onWalletGateHostChange, stackNav]);

  const moderation = useLiveRoomModeration({
    roomId: stream.id,
    accessToken,
    enabled: isActive,
  });
  const modActor = useMemo(
    () =>
      resolveModerationActor({
        canModerate: moderation.canModerate,
        isHost: moderation.isHost,
        isModerator: moderation.isModerator,
        viewerRole: moderation.viewerRole,
        moderatorLevel: moderation.moderatorLevel,
        allowedActions: moderation.allowedActions,
        sellerId: moderation.sellerId,
        userId,
        hostUserIdHint: stream.host.id,
      }),
    [
      moderation.allowedActions,
      moderation.canModerate,
      moderation.isHost,
      moderation.isModerator,
      moderation.moderatorLevel,
      moderation.sellerId,
      moderation.viewerRole,
      stream.host.id,
      userId,
    ],
  );
  const showHostUserId = modActor.showHostUserId;
  const staffCommerceBlocked = moderation.isHost || moderation.isModerator;

  const showBidNotice = useCallback((notice: LiveBidFailureDisplay) => {
    setBidNotice(notice);
    if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
    bidNoticeTimerRef.current = setTimeout(() => {
      bidNoticeTimerRef.current = null;
      setBidNotice(null);
    }, 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isActive || !showHostUserId) {
      setFollowing(false);
      return;
    }
    void fetchSellerFollowStatus(showHostUserId, accessToken).then((st) => {
      if (!st || st.isSelf) {
        setFollowing(false);
        return;
      }
      setFollowing(st.following);
    });
  }, [accessToken, isActive, showHostUserId]);

  useEffect(() => {
    if (!isActive || !userId) {
      setMyChatSender({});
      return;
    }
    void fetchProfileById(userId).then((profile) => {
      if (!profile) return;
      setMyChatSender({
        username: profile.username?.trim() || profile.display_name?.trim() || undefined,
        avatarUrl: profile.avatar_url ?? null,
      });
    });
  }, [isActive, userId]);

  const liveChat = useLiveRoomChat({
    roomId: stream.id,
    hostUsername: stream.host.handle.replace(/^@/, '') || stream.host.name,
    hostUserId: showHostUserId,
    accessToken,
    enabled: isActive,
    realtimePrimary: true,
    announceViewerJoin: signedIn,
    roomChatOpen: liveRoomChatOpen(roomStatus),
    onJoinAnnounceError: moderation.handleRestrictionError,
    senderUserId: userId,
    senderUsername: myChatSender.username,
    senderAvatarUrl: myChatSender.avatarUrl,
  });

  const slowMode = useLiveChatSlowMode({
    slowModeSeconds: moderation.slowModeSeconds ?? 0,
    exempt: modActor.canModerate,
    userId,
    messages: liveChat.messages,
    enabled: isActive && signedIn,
  });

  const chatComposerPlaceholder = slowModeComposerPlaceholder({
    slowModeSeconds: moderation.slowModeSeconds ?? 0,
    cooldownSeconds: slowMode.cooldownSeconds,
    chatBlocked: slowMode.chatBlocked,
    exempt: modActor.canModerate,
  });

  const liveSession = useLiveRoomRealtimeSession({
    roomId: stream.id,
    accessToken,
    userId,
    enabled: isActive,
    hostUsername: stream.host.handle.replace(/^@/, '') || stream.host.name,
    onModerationChanged: () => void moderation.reload(),
    onChatBroadcast: (message) => {
      if (!message.id) {
        void liveChat.reload();
        return;
      }
      liveChat.appendBroadcast(message);
    },
    onStreamRefresh: () => {
      setRoomStatus((prev) => (prev === 'ended' ? prev : 'live'));
    },
    onStreamHardRefresh: () => {
      setStreamRefreshNonce((n) => n + 1);
      setRoomStatus((prev) => (prev === 'ended' ? prev : 'live'));
    },
  });
  const fetchLiveSnapshot = liveSession.fetchSnapshot;

  useEffect(() => {
    if (!onSpotCelebrationHostChange) return undefined;
    if (!isActive || !liveSession.spotCelebration) {
      onSpotCelebrationHostChange(null);
      return () => onSpotCelebrationHostChange(null);
    }
    onSpotCelebrationHostChange({
      celebration: liveSession.spotCelebration,
      viewerUsername: myChatSender.username,
      clear: liveSession.clearSpotCelebration,
    });
    return () => onSpotCelebrationHostChange(null);
  }, [
    isActive,
    liveSession.clearSpotCelebration,
    liveSession.spotCelebration,
    myChatSender.username,
    onSpotCelebrationHostChange,
  ]);

  useEffect(() => {
    if (!isActive || (stream.liveRoomFormat !== 'break' && liveSession.roomSnap?.roomType !== 'break')) {
      setBreakDisclaimerAccepted(true);
      setBreakDisclaimerReady(true);
      return;
    }
    const key = breakDisclaimerStorageKey(stream.id, userId);
    void readBreakDisclaimerAccepted(key).then((accepted) => {
      setBreakDisclaimerAccepted(accepted);
      setBreakDisclaimerReady(true);
    });
  }, [isActive, stream.id, stream.liveRoomFormat, userId]);

  const breakParticipationBlocked =
    breakDisclaimerReady &&
    (stream.liveRoomFormat === 'break' || liveSession.roomSnap?.roomType === 'break') &&
    !breakDisclaimerAccepted;

  useEffect(() => {
    if (!isActive || !signedIn || !accessToken?.trim() || staffCommerceBlocked) {
      setWalletReadiness(null);
      return;
    }
    if (!breakDisclaimerReady || !breakDisclaimerAccepted) return;

    let cancelled = false;
    void fetchLiveBuyerPaymentSession(accessToken, stream.id).then((session) => {
      if (cancelled || !session) return;
      setWalletReadiness({
        paymentReady: session.paymentReady,
        shippingReady: session.shippingReady,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    breakDisclaimerAccepted,
    breakDisclaimerReady,
    isActive,
    roomVisitNonce,
    signedIn,
    staffCommerceBlocked,
    stream.id,
  ]);

  const walletParticipationBlocked = Boolean(
    signedIn &&
      accessToken?.trim() &&
      !staffCommerceBlocked &&
      breakDisclaimerReady &&
      breakDisclaimerAccepted &&
      walletReadiness &&
      isWalletIncompleteReadiness(walletReadiness) &&
      !liveSession.unresolvedPaymentFailure,
  );

  const showWalletGateModal = walletParticipationBlocked && !walletGateSheetOpen;

  useEffect(() => {
    if (!isActive) return;
    const gateActive = walletParticipationBlocked || walletGateSheetOpen;
    if (!gateActive || !walletReadiness || !accessToken?.trim()) {
      onWalletGateHostChange?.(null, null);
      return;
    }
    onWalletGateHostChange?.(
      {
        readiness: walletReadiness,
        showModal: showWalletGateModal,
        showSheet: walletGateSheetOpen,
        roomId: stream.id,
        accessToken,
      },
      {
        openSheet: () => setWalletGateSheetOpen(true),
        closeSheet: () => setWalletGateSheetOpen(false),
        leaveRoom: leaveRoomSafely,
        onReadinessChange: (next) => {
          setWalletReadiness(next);
          if (next.paymentReady && next.shippingReady) {
            setWalletGateSheetOpen(false);
            void fetchLiveSnapshot();
          }
        },
      },
    );
  }, [
    accessToken,
    fetchLiveSnapshot,
    isActive,
    leaveRoomSafely,
    onWalletGateHostChange,
    showWalletGateModal,
    stream.id,
    walletGateSheetOpen,
    walletParticipationBlocked,
    walletReadiness,
  ]);

  useEffect(() => {
    if (!isActive || liveSession.unresolvedPaymentFailure) return;
    onPaymentBlockerChange?.(walletParticipationBlocked || walletGateSheetOpen);
    return () => onPaymentBlockerChange?.(false);
  }, [
    isActive,
    liveSession.unresolvedPaymentFailure,
    onPaymentBlockerChange,
    walletGateSheetOpen,
    walletParticipationBlocked,
  ]);

  const participationBlockMessage = useMemo(() => {
    if (breakParticipationBlocked) {
      return 'Accept the live break notice before bidding or buying.';
    }
    if (walletParticipationBlocked && walletReadiness) {
      return buyerWalletGatePromptBody(walletReadiness);
    }
    if (liveSession.unresolvedPaymentFailure) {
      return 'Fix your payment before bidding or buying in this show.';
    }
    return 'Complete setup in this show before bidding or buying.';
  }, [
    breakParticipationBlocked,
    liveSession.unresolvedPaymentFailure,
    walletParticipationBlocked,
    walletReadiness,
  ]);

  useEffect(() => {
    setRoomStatus(stream.roomStatus);
  }, [stream.id, stream.roomStatus]);

  useEffect(() => {
    if (liveSession.roomSnap?.status === 'ended') setRoomStatus('ended');
  }, [liveSession.roomSnap?.status]);

  useEffect(() => {
    if (roomStatus === 'ended') setCommerceHeight(0);
  }, [roomStatus]);

  useEffect(() => {
    if (!isActive || roomStatus === 'live' || roomStatus === 'ended') return undefined;
    const id = setInterval(() => {
      void fetchLiveRoomPublicById(stream.id).then((row) => {
        if (!row?.status || row.status === roomStatus) return;
        setRoomStatus(row.status);
        if (row.status === 'live') setStreamRefreshNonce((n) => n + 1);
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [isActive, roomStatus, stream.id]);

  const hostHandle = stream.host.handle.replace(/^@/, '') || stream.host.name;

  useEffect(() => {
    if (!signedIn || !accessToken?.trim() || moderation.isHost) return;
    void fetchLiveBuyerPaymentSession(accessToken, stream.id).then((session) => {
      const nextId = session?.activePaymentMethodId?.trim() || null;
      if (nextId) setRoomPaymentMethodId(nextId);
    });
  }, [accessToken, moderation.isHost, signedIn, stream.id]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOffset(e.endCoordinates.height - insets.bottom);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!isActive) return;
    logLiveStageLayoutDebug({
      roomId: stream.id,
      screenWidth: stageContainer.designWidth,
      screenHeight,
      designWidth: stageContainer.designWidth,
      designHeight: stageContainer.designHeight,
      uniformScale: stageContainer.uniformScale,
      layoutWidth: stageContainer.layoutWidth,
      layoutHeight: stageContainer.layoutHeight,
      offsetLeft: stageContainer.offsetLeft,
      offsetTop: stageContainer.offsetTop,
      contentFit: LIVE_STAGE_CONTENT_FIT,
    });
  }, [isActive, stream.id, stageContainer, screenHeight]);

  useEffect(() => {
    if (isActive) return undefined;
    if (!signedIn || !accessToken) return undefined;
    void liveChat.announceLeave();
    return undefined;
  }, [isActive, signedIn, accessToken, liveChat.announceLeave]);

  useEffect(() => {
    return () => {
      if (!signedIn || !accessToken) return;
      void liveChat.announceLeave();
    };
  }, [signedIn, accessToken, liveChat.announceLeave]);

  const chatPool = liveChat.messages;

  const pinnedModerator = useMemo(() => {
    if (!moderation.pinnedMessageActive) return null;
    const body = moderation.pinnedModeratorMessage?.trim();
    if (!body) return null;
    const username =
      resolvePinnedModeratorUsername({
        pinnedModeratorUsername: moderation.pinnedModeratorUsername,
        pinnedModeratorUserId: moderation.pinnedModeratorUserId,
        moderators: moderation.moderators,
      }) ?? '';
    const pinnedUserId = moderation.pinnedModeratorUserId?.trim();
    const isHost = Boolean(
      pinnedUserId &&
        (pinnedUserId === showHostUserId ||
          pinnedUserId === moderation.sellerId ||
          pinnedUserId === stream.host.id),
    );
    return {
      body,
      username,
      avatarUrl: moderation.pinnedModeratorAvatarUrl,
      isHost,
    };
  }, [
    moderation.moderators,
    moderation.pinnedMessageActive,
    moderation.pinnedModeratorAvatarUrl,
    moderation.pinnedModeratorMessage,
    moderation.pinnedModeratorUserId,
    moderation.pinnedModeratorUsername,
    moderation.sellerId,
    showHostUserId,
    stream.host.id,
  ]);

  const dockPaddingBottom = stageInsets.bottom;
  const bottomStack = computeLiveRoomBottomStack({
    dockPaddingBottom,
    commerceHeight,
    keyboardOffset: keyboardOffset / Math.max(0.001, stageContainer.uniformScale),
    compact,
    pinnedModeratorActive: Boolean(pinnedModerator),
    overlayScale,
  });
  const chatMaxHeight = computeChatStackMaxHeight({
    slideHeight: stageContainer.designHeight,
    topReserve: computeLiveTopReserve(stageInsets.top, layoutWidth),
    chatBottom: bottomStack.chatBottom,
    overlayScale,
    expanded: chatExpanded,
  });
  const giveawayTabTop = computeGiveawaySideTabTop(stageInsets.top, layoutWidth);
  const composerBarHeight = scaledComposerBarHeight(overlayScale);
  const slowModeTimerBottom = bottomStack.composerBottom + composerBarHeight + 8;

  const immersiveGestureEnabled =
    isActive &&
    !shopOpen &&
    !tipOpen &&
    !modDrawerOpen &&
    !reportOpen &&
    !modActionMessage &&
    !preBidItem &&
    !chatExpanded &&
    keyboardOffset <= 0 &&
    breakDisclaimerAccepted &&
    !walletParticipationBlocked &&
    !(liveSession.unresolvedPaymentFailure && signedIn && accessToken);

  const immersiveChrome = useLiveImmersiveChrome({
    stageWidth: layoutWidth,
    enabled: immersiveGestureEnabled,
  });

  useEffect(() => {
    if (!isActive) immersiveChrome.restore();
  }, [isActive, immersiveChrome.restore]);

  useEffect(() => {
    setChatExpanded(false);
  }, [stream.id]);

  useEffect(() => {
    if (chatExpanded) immersiveChrome.restore();
  }, [chatExpanded, immersiveChrome.restore]);

  const removedFromShow =
    moderation.roomBlocked ||
    Boolean(moderation.myRestrictions?.roomBanned) ||
    Boolean(moderation.myRestrictions?.kickedUntil) ||
    Boolean(moderation.myRestrictions?.sellerStreamBanned);
  const removedNoticeShownRef = useRef(false);

  useEffect(() => {
    if (!removedFromShow) {
      removedNoticeShownRef.current = false;
      return;
    }
    if (removedNoticeShownRef.current) return;
    removedNoticeShownRef.current = true;
    Alert.alert('Removed from show', 'You were removed from this live show.', [
      { text: 'Leave', onPress: () => leaveRoomSafely() },
    ]);
  }, [leaveRoomSafely, removedFromShow]);

  const tagUserInChat = useCallback((username: string) => {
    setChatDraft((prev) => appendMentionToDraft(prev, username));
    requestAnimationFrame(() => chatComposerRef.current?.focus());
  }, []);

  const applyChatUserModeration = useCallback(
    async (actionType: 'kick' | 'room_ban' | 'seller_stream_ban', targetUserId: string, username: string) => {
      if (!accessToken?.trim()) return;
      const label =
        actionType === 'kick'
          ? 'Kicked from show'
          : actionType === 'room_ban'
            ? 'Banned from show'
            : 'Banned from seller shows';
      const result = await applyLiveModerationAction({
        accessToken,
        roomId: stream.id,
        actionType,
        targetUserId,
        reason: `${label} (@${username})`,
        metadata: { source: 'username_menu' },
      });
      if (!result.ok) {
        Alert.alert('Moderation failed', result.error ?? 'Action could not be completed.');
        return;
      }
      void moderation.reload();
    },
    [accessToken, moderation, stream.id],
  );

  const onPressChatUser = useCallback(
    (user: { username: string; userId?: string }) => {
      const targetUserId = user.userId?.trim();
      const canKick =
        modActor.canModerate &&
        canShowLiveChatKickOption({
          targetUserId,
          hostUserId: showHostUserId,
          allowedActions: modActor.allowedActions,
          isHost: modActor.isHost,
          isModerator: modActor.isModerator,
          canModerate: modActor.canModerate,
          moderatorLevel: modActor.moderatorLevel,
        });
      const canBan =
        modActor.canModerate &&
        canShowLiveChatBanOption({
          targetUserId,
          hostUserId: showHostUserId,
          isHost: modActor.isHost,
          allowedActions: modActor.allowedActions,
        });

      promptLiveChatUserAction({
        username: user.username,
        userId: targetUserId,
        onTag: tagUserInChat,
        onViewProfile: targetUserId ? (userId) => openUserProfile(userId) : undefined,
        moderation:
          canKick || canBan
            ? {
                canKickFromShow: canKick,
                canBanFromSeller: canBan,
                onKickFromShow: () => {
                  if (targetUserId) void applyChatUserModeration('kick', targetUserId, user.username);
                },
                onBanFromSeller: () => {
                  if (targetUserId) void applyChatUserModeration('seller_stream_ban', targetUserId, user.username);
                },
              }
            : undefined,
      });
    },
    [applyChatUserModeration, modActor.allowedActions, modActor.canModerate, modActor.isHost, showHostUserId, tagUserInChat],
  );

  const sendFloatingChat = useCallback(async () => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    if (breakParticipationBlocked) {
      Alert.alert('Accept notice', 'Accept the live break notice before chatting.');
      return;
    }
    if (slowMode.chatBlocked) return;
    const t = chatDraft.trim();
    if (!t || liveChat.sending) return;
    chatComposerRef.current?.dismissSuggestions();
    setChatDraft('');
    try {
      const ok = await liveChat.send(t);
      if (ok) {
        slowMode.recordSuccessfulSend();
        chatComposerRef.current?.blur();
        Keyboard.dismiss();
      }
    } catch (e) {
      setChatDraft(t);
      const msg = e instanceof Error ? e.message : String(e);
      slowMode.syncFromSendError(msg);
      moderation.handleRestrictionError(msg);
      if (__DEV__) console.warn('[liveRoom chat] send failed', msg);
    }
  }, [
    signedIn,
    onRequireAuth,
    breakParticipationBlocked,
    slowMode.chatBlocked,
    slowMode.recordSuccessfulSend,
    slowMode.syncFromSendError,
    chatDraft,
    liveChat.sending,
    liveChat.send,
    moderation.handleRestrictionError,
  ]);

  const openHostProfile = useCallback(() => {
    void openLiveHostProfile({
      hostUserId: showHostUserId,
      hostUsername: hostHandle,
    });
  }, [hostHandle, showHostUserId]);

  const openProfileSettings = () => {
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('Settings');
  };

  const openShareSheet = () => {
    setShareSheetOpen(true);
  };

  const handleShopItemPress = useCallback(
    async (item: LiveRoomLineupItemSnapshot) => {
      setShopOpen(false);
      if (!signedIn || !accessToken) {
        onRequireAuth?.();
        return;
      }
      if (item.queueAction === 'pre_bid') {
        setPreBidItem(item);
        return;
      }
      if (item.queueAction === 'buy_now') {
        if (!item.isPinned || liveSession.roomSnap?.activeItemId !== item.id) {
          Alert.alert('Not on screen yet', 'Buy now unlocks when the host shows this item live.');
          return;
        }
        if (liveSession.roomSnap?.roomType !== 'sale') {
          Alert.alert('Not available', 'Buy now is only available in sale rooms.');
          return;
        }
        if (!item.listingId) {
          Alert.alert('Checkout unavailable', 'This item is not linked to checkout yet.');
          return;
        }
        try {
          const paymentSession = await fetchLiveBuyerPaymentSession(accessToken, stream.id);
          const res = await purchaseLiveBuyNow({
            accessToken,
            liveRoomId: stream.id,
            itemId: item.id,
            paymentMethodId: paymentSession?.activePaymentMethodId ?? undefined,
          });
          if (!res.ok) {
            if (res.walletIncomplete) {
              openWalletRef.current('shop_buy_now');
              return;
            }
            Alert.alert('Could not buy', mapLivePaymentFailureMessage(res.error, res.code));
            return;
          }
          if ('requiresAction' in res && res.requiresAction && res.clientSecret && res.orderId) {
            const synced = await syncLiveBuyNowPurchase({
              accessToken,
              liveRoomId: stream.id,
              itemId: item.id,
              orderId: res.orderId,
            });
            if (!synced.ok) {
              Alert.alert('Payment incomplete', mapLivePaymentFailureMessage(synced.error, synced.code));
              return;
            }
          }
          void liveSession.fetchSnapshot();
          Alert.alert('Purchased', 'Your buy-now order is confirmed.');
        } catch (e) {
          Alert.alert('Could not buy', e instanceof Error ? e.message : 'Try again.');
        }
      }
    },
    [accessToken, liveSession, onRequireAuth, signedIn, stream.id],
  );

  const preBidMinUsd = useMemo(() => {
    if (!preBidItem) return 1;
    return liveAuctionMinBidUsd({
      currentBidUsd: preBidItem.currentBidUsd,
      startingBidUsd: preBidItem.startingBidUsd,
      lastHighBidderId: preBidItem.lastHighBidderId,
    });
  }, [preBidItem]);

  const shareClipFromRoom = async () => {
    try {
      await Share.share({
        message: `Clip from “${stream.title}” on Get Vaulted`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <>
      {liveSession.connectionBanner ? (
        <View style={styles.connectionBanner} pointerEvents="none">
          <Text style={styles.connectionBannerTxt}>{liveSession.connectionBanner}</Text>
        </View>
      ) : null}
      {bidNotice ? (
        <LiveBidNoticeToast
          title={bidNotice.title}
          message={bidNotice.message}
          variant={bidNotice.kind === 'outbid' ? 'outbid' : 'info'}
        />
      ) : liveSession.showOutbidToast ? (
        <LiveBidNoticeToast
          title="Outbid"
          message="New high bid on this item — tap bid to raise your offer."
          variant="outbid"
        />
      ) : null}
      {paymentRecoveryToast ? (
        <View style={styles.recoveryToast} pointerEvents="none">
          <Text style={styles.recoveryToastTxt}>{paymentRecoveryToast}</Text>
        </View>
      ) : null}
      <LiveAuctionSoldCelebration
        celebration={liveSession.soldCelebration}
        onDone={liveSession.clearSoldCelebration}
      />
      <VaultRevealOverlay
        spin={liveSession.vaultRevealSpin}
        onDismiss={liveSession.clearVaultRevealSpin}
      />
      <View style={styles.slide}>
        <KeyboardDismissStageShield active={keyboardOffset > 0} />
        <View style={computeLiveStageHostStyle(stageContainer)}>
          <View style={[styles.stageRoot, computeLiveStageRootStyle(stageContainer)]}>
            <GestureDetector gesture={immersiveChrome.pan}>
              <View style={styles.stageGestureRoot}>
            <View style={styles.stageVideoFrame} pointerEvents="box-none">
              <LiveStagePlayback
                roomId={stream.id}
                roomStatus={roomStatus}
                scheduledStartAtIso={stream.scheduledStartAtIso}
                thumbnailUrl={stream.previewImageUrl}
                playbackMode={playbackMode}
                accessToken={accessToken}
                refreshNonce={streamRefreshNonce}
                muted={isActive ? streamMuted : true}
                onMutedChange={setStreamMuted}
              />
              <LinearGradient
                colors={stream.thumbnailGradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[StyleSheet.absoluteFill, { opacity: 0.08 }]}
                pointerEvents="none"
              />
            </View>

                <Animated.View
                  style={[styles.chromeLayer, immersiveChrome.chromeStyle]}
                  pointerEvents={immersiveChrome.immersive ? 'none' : 'box-none'}
                >

            {/* TOP — header overlays the 9:16 stage */}
            <View
              style={[
                styles.topBar,
                {
                  paddingTop: stageInsets.top + (compact ? 4 : 6),
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
        <View style={styles.topBarRow}>
          <View style={styles.topBarLeft}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.backIconOnly}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.92)" />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.hostIdentity}
              onPress={openHostProfile}
              accessibilityRole="button"
              accessibilityLabel={`View ${stream.host.name} profile`}
            >
              <UserAvatar
                uri={stream.host.avatarUrl}
                name={stream.host.name}
                username={stream.host.handle}
                size={compact ? 28 : 32}
                borderColor="rgba(255,255,255,0.35)"
              />
              <View style={styles.hostTextCol}>
                <LiveRoomText style={[styles.hostNameTop, compact && styles.hostNameTopCompact]} numberOfLines={1}>
                  {stream.host.name}
                </LiveRoomText>
                <LiveRoomText style={[styles.hostSubtitleTop, compact && styles.hostSubtitleTopCompact]} numberOfLines={1}>
                  {stream.title}
                </LiveRoomText>
                {stream.pinnedItemSubtitle && !compact ? (
                  <LiveRoomText style={styles.hostMetaLine} numberOfLines={1}>
                    {stream.pinnedItemSubtitle}
                  </LiveRoomText>
                ) : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.topBarRight}>
            <View style={styles.liveStatusCluster}>
              {roomStatus === 'live' ? (
                <LiveBadge compact pulse inline />
              ) : roomStatus === 'scheduled' ? (
                <LiveBadge compact inline label="SOON" variant="scheduled" pulse={false} />
              ) : (
                <LiveRoomText style={styles.endedBadge}>ENDED</LiveRoomText>
              )}
              <LiveRoomText style={[styles.viewersTopRight, compact && styles.viewersTopRightCompact]}>
                {formatViewers(liveSession.viewerCount ?? 0)}
              </LiveRoomText>
            </View>
            <Pressable
              style={styles.iconTopBare}
              onPress={() => setStreamMuted((m) => !m)}
              accessibilityLabel={streamMuted ? 'Unmute stream' : 'Mute stream'}
            >
              <Ionicons
                name={streamMuted ? 'volume-mute-outline' : 'volume-high-outline'}
                size={20}
                color="rgba(255,255,255,0.88)"
              />
            </Pressable>
            <Pressable
              style={styles.iconTopBare}
              onPress={openProfileSettings}
              accessibilityLabel="Stream settings"
            >
              <Ionicons name="settings-outline" size={19} color="rgba(255,255,255,0.88)" />
            </Pressable>
            <Pressable
              style={styles.iconTopBare}
              onPress={() => {
                if (!signedIn) {
                  onRequireAuth?.();
                  return;
                }
                setReportOpen(true);
              }}
              accessibilityLabel="Report show"
            >
              <Ionicons name="flag-outline" size={19} color="rgba(255,255,255,0.88)" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* RIGHT — creator actions (commerce via Shop modal, not a bottom sheet). */}
      <View
        style={[
          styles.rightRail,
          compact && styles.rightRailCompact,
          {
            bottom: bottomStack.commerceTop + spacing.sm,
          },
        ]}
      >
        {!moderation.isHost ? (
          <Pressable
            style={styles.railBtn}
            onPress={() => {
              if (!signedIn || !accessToken) {
                onRequireAuth?.();
                return;
              }
              const prev = following;
              setFollowing(!prev);
              void toggleSellerFollow(showHostUserId ?? stream.host.id, prev, accessToken).then(({ following: next, error }) => {
                if (error) {
                  setFollowing(prev);
                  Alert.alert('Follow', error);
                  return;
                }
                setFollowing(next);
              });
            }}
            accessibilityLabel={following ? 'Unfollow host' : 'Follow host'}
          >
            <Ionicons
              name={following ? 'checkmark-circle-outline' : 'person-add-outline'}
              size={railIconSize}
              color={following ? colors.gold : 'rgba(255,255,255,0.92)'}
            />
            <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize }]}>
              {following ? 'Following' : 'Follow'}
            </LiveRoomText>
          </Pressable>
        ) : null}
        {!moderation.isHost ? (
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            if (rootNavigationRef.isReady()) {
              rootNavigationRef.navigate('MessageCompose', {
                liveRoomId: stream.id,
                sellerUserId: stream.host.id,
                sellerUsername: stream.host.handle || stream.host.name,
              });
            }
          }}
          accessibilityLabel="Message seller privately"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={railIconSize} color={colors.gold} />
          <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize, color: colors.gold }]}>
            Message
          </LiveRoomText>
        </Pressable>
        ) : null}
        {!moderation.isHost ? (
          <Pressable
            style={styles.railBtn}
            onPress={() => {
              if (!signedIn) {
                onRequireAuth?.();
                return;
              }
              if (!accessToken) {
                Alert.alert('Sign in required', 'Log in to send a tip.');
                return;
              }
              if (liveSession.unresolvedPaymentFailure) {
                Alert.alert(
                  'Payment required',
                  'Fix your failed payment before tipping in this show.',
                );
                return;
              }
              setTipOpen(true);
            }}
            accessibilityLabel="Send a tip"
          >
            <Ionicons name="cash-outline" size={railIconSize} color={colors.gold} />
            <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize, color: colors.gold }]}>
              Tip
            </LiveRoomText>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.railBtn, compact && styles.railBtnCompact]}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            openWalletRef.current('rail_wallet');
          }}
          accessibilityLabel="Vault Wallet"
        >
          <Ionicons
            name="wallet-outline"
            size={compact ? Math.max(20, railIconSize - 2) : railIconSize}
            color="rgba(255,255,255,0.92)"
          />
          <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize }]}>Wallet</LiveRoomText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            setShopOpen(true);
          }}
          accessibilityLabel="Shop this room"
        >
          <Ionicons name="bag-handle-outline" size={railIconSize} color="rgba(255,255,255,0.92)" />
          <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize }]}>Shop</LiveRoomText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            if (!signedIn) {
              onRequireAuth?.();
              return;
            }
            void shareClipFromRoom();
          }}
        >
          <Ionicons name="cut-outline" size={railIconSize} color="rgba(255,255,255,0.92)" />
          <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize }]}>Clip</LiveRoomText>
        </Pressable>
        <Pressable
          style={styles.railBtn}
          onPress={() => {
            openShareSheet();
          }}
        >
          <Ionicons name="share-outline" size={railIconSize} color="rgba(255,255,255,0.92)" />
          <LiveRoomText style={[styles.railLabel, { fontSize: railLabelSize }]}>Share</LiveRoomText>
        </Pressable>
      </View>

      <FloatingLiveChat
        pool={chatPool}
        hostAvatarUrl={stream.host.avatarUrl}
        hostUserId={showHostUserId}
        bottom={bottomStack.chatBottom}
        left={spacing.lg}
        rightEdge={chatRightEdge}
        maxHeight={chatMaxHeight}
        compact={compact}
        overlayScale={overlayScale}
        isActive={isActive}
        streamKey={stream.id}
        liveRoomId={stream.id}
        accessToken={accessToken}
        canModerate={modActor.canModerate}
        isModerator={modActor.isModerator}
        viewerRole={modActor.viewerRole}
        onLongPressMessage={(message) => setModActionMessage(message)}
        onLongPressChatUser={(message) => setReportChatMessage(message)}
        onModerationComplete={() => {
          void liveChat.reload();
          void moderation.reload();
        }}
        onPressChatUser={onPressChatUser}
        moderatorUserIds={moderation.moderators.map((m) => m.userId)}
        expanded={chatExpanded}
        onToggleExpanded={() => setChatExpanded((prev) => !prev)}
      />

      {pinnedModerator ? (
        <View
          style={{
            position: 'absolute',
            bottom: bottomStack.pinnedBarBottom,
            left: spacing.lg,
            right: chatRightEdge,
            zIndex: 17,
          }}
          pointerEvents="none"
        >
          <PinnedModeratorBar pinned={pinnedModerator} compact={compact} overlayScale={overlayScale} />
        </View>
      ) : null}

      {showModeratorTools(modActor.isModerator, modActor.canModerate, modActor.isHost) && accessToken ? (
        <ModeratorDrawer
          visible={modDrawerOpen}
          onClose={() => setModDrawerOpen(false)}
          liveRoomId={stream.id}
          moderatorUserId={userId}
          accessToken={accessToken}
          moderation={{
            ...moderation,
            canModerate: modActor.canModerate,
            isHost: modActor.isHost,
            isModerator: modActor.isModerator,
            viewerRole: modActor.viewerRole,
            moderatorLevel: modActor.moderatorLevel,
            allowedActions: modActor.allowedActions,
          }}
          onModerationPatch={moderation.patch}
          onRefresh={() => {
            void moderation.reload();
            void liveChat.reload();
          }}
        />
      ) : null}

      {modActionMessage && accessToken ? (
        <ModeratorActionSheet
          visible={Boolean(modActionMessage)}
          onClose={() => setModActionMessage(null)}
          liveRoomId={stream.id}
          accessToken={accessToken}
          isModerator={modActor.isModerator}
          isHost={modActor.isHost}
          canModerate={modActor.canModerate}
          moderatorLevel={modActor.moderatorLevel}
          allowedActions={modActor.allowedActions}
          messageId={modActionMessage.id}
          messageText={modActionMessage.text}
          senderId={modActionMessage.senderId}
          senderUsername={modActionMessage.user}
          hostUserId={showHostUserId}
          messageIsHost={modActionMessage.isHost}
          onComplete={() => {
            setModActionMessage(null);
            void liveChat.reload();
            void moderation.reload();
          }}
        />
      ) : null}

      {moderation.roomBlocked ||
      moderation.myRestrictions?.roomBanned ||
      moderation.myRestrictions?.kickedUntil ||
      moderation.myRestrictions?.sellerStreamBanned ? (
        <View style={[styles.blockedBanner, { top: stageInsets.top + 56 }]}>
          <LiveRoomText style={styles.blockedBannerText}>
            You cannot participate in this room.
          </LiveRoomText>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.blockedBannerBtn}>
              <LiveRoomText style={styles.blockedBannerBtnText}>Leave show</LiveRoomText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(moderation.myRestrictions?.muted || liveChat.error?.includes('muted')) && !moderation.roomBlocked ? (
        <View style={[styles.mutedBanner, { bottom: bottomStack.composerBottom + COMPOSER_BAR_HEIGHT + 8 }]}>
          <LiveRoomText style={styles.mutedBannerText}>You are muted in this room.</LiveRoomText>
        </View>
      ) : null}

      {slowMode.slowModeActive ? (
        <LiveChatSlowModeTimer
          bottom={slowModeTimerBottom}
          left={spacing.lg}
          right={chatRightEdge}
          slowModeSeconds={moderation.slowModeSeconds ?? 0}
          cooldownSeconds={slowMode.cooldownSeconds}
          chatBlocked={slowMode.chatBlocked}
          overlayScale={overlayScale}
        />
      ) : null}

      <FloatingChatComposer
        bottom={bottomStack.composerBottom}
        left={spacing.lg}
        rightEdge={chatRightEdge}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={sendFloatingChat}
        placeholder={chatComposerPlaceholder}
        inputDisabled={
          slowMode.chatBlocked ||
          Boolean(moderation.myRestrictions?.muted || liveChat.error?.includes('muted'))
        }
        sendDisabled={liveChat.sending || breakParticipationBlocked || slowMode.chatBlocked}
        accessToken={accessToken}
        liveRoomId={stream.id}
        inputRef={chatComposerRef}
        overlayScale={overlayScale}
        leadingAccessory={
          showModeratorTools(modActor.isModerator, modActor.canModerate, modActor.isHost) ? (
            <ModeratorToolsButton onPress={() => setModDrawerOpen(true)} />
          ) : null
        }
      />

      {roomStatus === 'live' && (liveSession.roomSnap?.giveaways?.length ?? 0) > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: giveawayTabTop,
            zIndex: 40,
          }}
          pointerEvents="box-none"
        >
          <LiveGiveawaySideTab
            roomId={stream.id}
            accessToken={accessToken}
            giveaways={liveSession.roomSnap?.giveaways ?? []}
            signedIn={signedIn}
            compact={compact}
            onRequireAuth={onRequireAuth}
            onEntered={() => void liveSession.fetchSnapshot()}
            onTimerExpired={() => void liveSession.fetchSnapshot()}
          />
        </View>
      ) : null}

      {roomStatus !== 'ended' ? (
      <View
        style={[
          styles.commerceOverlayHost,
          {
            bottom: bottomStack.commerceBottom,
            left: spacing.md,
            right: spacing.md,
          },
        ]}
        pointerEvents={isActive ? 'auto' : 'none'}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - commerceHeight) > 2) setCommerceHeight(h);
        }}
      >
        <LivePinnedActionBar
          stream={stream}
          bottomSafeInset={stageInsets.bottom}
          signedIn={signedIn}
          onRequireAuth={onRequireAuth}
          accessToken={accessToken}
          onOpenInlineShop={() => setShopOpen(true)}
          roomSnap={liveSession.roomSnap}
          syncRefreshing={liveSession.syncRefreshing}
          onRefreshSnapshot={liveSession.fetchSnapshot}
          clockSkewMs={liveSession.clockSkewMs}
          mergeBidAck={liveSession.mergeBidAck}
          onBidPlaced={(amount) => liveSession.setMyHighBidUsd(amount)}
          onBidNotice={showBidNotice}
          participationBlocked={
            breakParticipationBlocked ||
            walletParticipationBlocked ||
            Boolean(liveSession.unresolvedPaymentFailure)
          }
          participationBlockMessage={participationBlockMessage}
          onWalletOverlayChange={
            isActive
              ? (active) => {
                  if (active) immersiveChrome.restore();
                  onWalletOverlayChange?.(active);
                }
              : undefined
          }
          layoutWidth={layoutWidth}
          onRegisterOpenWallet={(open) => {
            openWalletRef.current = open;
          }}
          staffCommerceBlocked={staffCommerceBlocked}
          onSpotCelebration={liveSession.showSpotCelebration}
          viewerUsername={myChatSender.username}
          commerceActive={isActive}
        />
      </View>
      ) : null}
                </Animated.View>
              </View>
            </GestureDetector>

      {liveSession.unresolvedPaymentFailure && signedIn && accessToken ? (
        <LivePaymentFailureModal
          visible
          roomId={stream.id}
          accessToken={accessToken}
          failure={liveSession.unresolvedPaymentFailure}
          onResolved={() => {
            void liveSession.fetchSnapshot();
            setPaymentRecoveryToast(PAYMENT_RECOVERY_SUCCESS_TOAST);
            setTimeout(() => setPaymentRecoveryToast(null), 3600);
          }}
          onLeaveRoom={leaveRoomSafely}
          onWalletOverlayChange={
            isActive
              ? (active) => {
                  if (active) immersiveChrome.restore();
                  onWalletOverlayChange?.(active);
                }
              : undefined
          }
          onBlockerActiveChange={isActive ? onPaymentBlockerChange : undefined}
        />
      ) : null}
          </View>
        </View>
      </View>

      <LiveBuyerShopSheet
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        lineupItems={liveSession.roomSnap?.lineupItems ?? []}
        activeItemId={liveSession.roomSnap?.activeItemId ?? null}
        onItemPress={(item) => void handleShopItemPress(item)}
      />
      {accessToken && preBidItem ? (
        <LiveCustomBidSheet
          visible
          onClose={() => setPreBidItem(null)}
          minNextBidUsd={preBidMinUsd}
          currentBidUsd={preBidItem.currentBidUsd}
          reserveSupported={false}
          busy={preBidBusy}
          onSubmit={async (payload) => {
            setPreBidBusy(true);
            try {
              const res = await placeLiveRoomPreBid({
                accessToken,
                roomId: stream.id,
                itemId: preBidItem.id,
                amountUsd: payload.amountUsd,
              });
              if (!res.ok) {
                if (res.walletIncomplete) {
                  openWalletRef.current('shop_pre_bid');
                  return;
                }
                Alert.alert('Pre-bid failed', res.error);
                return;
              }
              setPreBidItem(null);
              void liveSession.fetchSnapshot();
              Alert.alert('Pre-bid set', `You are set at $${payload.amountUsd.toFixed(2)} when bidding opens.`);
            } finally {
              setPreBidBusy(false);
            }
          }}
        />
      ) : null}
      {accessToken ? (
        <LiveTipSheet
          visible={tipOpen}
          onClose={() => setTipOpen(false)}
          liveRoomId={stream.id}
          accessToken={accessToken}
          paymentMethodId={roomPaymentMethodId}
          onPaymentMethodIdChange={setRoomPaymentMethodId}
          onOpenWallet={() => openWalletRef.current('tip_wallet')}
          onSuccess={() => Alert.alert('Tip sent', 'Thanks for supporting the show!')}
          onError={(msg) => Alert.alert('Tip', msg)}
        />
      ) : null}
      <LiveRoomShareSheet
        visible={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        roomId={stream.id}
        showTitle={stream.title}
        hostUsername={stream.host.handle.replace(/^@+/, '') || stream.host.name}
        hostAvatarUrl={stream.host.avatarUrl}
        previewImageUrl={stream.previewImageUrl}
        thumbnailGradient={stream.thumbnailGradient}
        isLive={roomStatus === 'live'}
        accessToken={accessToken}
        canNotifyFollowers={modActor.isHost}
        onInAppShareSent={() => {
          if (signedIn && accessToken) void liveChat.announceShare();
        }}
        onToast={(msg) => Alert.alert('Share', msg)}
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="live_room"
        targetId={stream.id}
        liveRoomId={stream.id}
        accessToken={accessToken}
        title="Report show"
      />
      {reportChatMessage ? (
        <ReportSheet
          visible
          onClose={() => setReportChatMessage(null)}
          targetType="message"
          targetId={reportChatMessage.id}
          liveRoomId={stream.id}
          accessToken={accessToken}
          title="Report message"
        />
      ) : null}
      {breakDisclaimerReady && (stream.liveRoomFormat === 'break' || liveSession.roomSnap?.roomType === 'break') && !breakDisclaimerAccepted ? (
        <BreakDisclaimerModal
          visible
          onAccept={() => {
            const key = breakDisclaimerStorageKey(stream.id, userId);
            void writeBreakDisclaimerAccepted(key);
            setBreakDisclaimerAccepted(true);
          }}
          onDecline={leaveRoomSafely}
        />
      ) : null}
    </>
  );
}

export function VerticalLiveFeed({
  streams,
  initialStreamId,
  roomVisitNonce = 0,
  onBack,
  signedIn = true,
  onRequireAuth,
  accessToken,
  userId,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [layoutSize, setLayoutSize] = useState<{ width: number; height: number } | null>(null);

  const layoutWidth = layoutSize?.width ?? windowWidth;
  const layoutHeight = layoutSize?.height ?? windowHeight;
  const viewportWidth = layoutWidth;
  const viewportHeight = layoutHeight;
  const stageContainer = useMemo(
    () => computeLiveStageContainer(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const startIndex = useMemo(() => {
    if (!initialStreamId) return 0;
    const i = streams.findIndex((s) => s.id === initialStreamId);
    return i >= 0 ? i : 0;
  }, [initialStreamId, streams]);

  const [page, setPage] = useState(startIndex);
  const [peekPage, setPeekPage] = useState<number | null>(null);
  const [walletOverlayActive, setWalletOverlayActive] = useState(false);
  const [paymentBlockerActive, setPaymentBlockerActive] = useState(false);
  const [walletGateHost, setWalletGateHost] = useState<WalletGateHostSnapshot | null>(null);
  const [spotCelebrationHost, setSpotCelebrationHost] = useState<LiveSpotCelebrationHost | null>(null);
  const walletGateActionsRef = useRef<WalletGateHostActions | null>(null);
  const pagerRef = useRef<PagerView>(null);

  const handleSpotCelebrationHostChange = useCallback((host: LiveSpotCelebrationHost | null) => {
    setSpotCelebrationHost(host);
  }, []);

  const handleWalletGateHostChange = useCallback(
    (snapshot: WalletGateHostSnapshot | null, actions: WalletGateHostActions | null) => {
      walletGateActionsRef.current = actions;
      setWalletGateHost((prev) => {
        if (walletGateHostSnapshotsEqual(prev, snapshot)) return prev;
        return snapshot;
      });
    },
    [],
  );

  const clearWalletGateOverlay = useCallback(() => {
    setWalletGateHost(null);
    walletGateActionsRef.current = null;
    setPaymentBlockerActive(false);
    setWalletOverlayActive(false);
  }, []);

  const leaveWalletGateRoom = useCallback(() => {
    setWalletGateHost((prev) => (prev ? { ...prev, showModal: false, showSheet: false } : null));
    walletGateActionsRef.current?.leaveRoom();
  }, []);

  const feedGesturesEnabled = !walletOverlayActive && !paymentBlockerActive && streams.length > 1;

  const goToRelativePage = useCallback(
    (delta: number) => {
      const next = page + delta;
      if (next < 0 || next >= streams.length) return;
      pagerRef.current?.setPage(next);
      setPage(next);
      setPeekPage(null);
    },
    [page, streams.length],
  );

  const showSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(feedGesturesEnabled)
        .activeOffsetY([-28, 28])
        .failOffsetX([-22, 22])
        .onEnd((event) => {
          if (event.translationY <= -72) runOnJS(goToRelativePage)(1);
          else if (event.translationY >= 72) runOnJS(goToRelativePage)(-1);
        }),
    [feedGesturesEnabled, goToRelativePage],
  );

  const warmPageIndices = useMemo(() => {
    const indices = new Set<number>([page]);
    if (page > 0) indices.add(page - 1);
    if (page < streams.length - 1) indices.add(page + 1);
    if (peekPage != null && peekPage >= 0 && peekPage < streams.length) {
      indices.add(peekPage);
    }
    return indices;
  }, [page, peekPage, streams.length]);

  useEffect(() => {
    if (!streams.length) return;
    const roomIds = [...warmPageIndices]
      .map((index) => streams[index]?.id)
      .filter((id): id is string => Boolean(id));
    prefetchLiveStreamRooms(roomIds, accessToken);
  }, [accessToken, streams, warmPageIndices]);

  const resolvePlaybackMode = useCallback(
    (index: number): LivePlaybackMode => {
      if (index === page) return 'active';
      if (warmPageIndices.has(index)) return 'prefetch';
      return 'off';
    },
    [page, warmPageIndices],
  );

  useEffect(() => {
    setPage(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (!walletOverlayActive) return;
    setWalletOverlayActive(false);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!paymentBlockerActive) return;
    setPaymentBlockerActive(false);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setWalletGateHost(null);
    walletGateActionsRef.current = null;
  }, [page, roomVisitNonce]);

  useEffect(() => () => clearWalletGateOverlay(), [clearWalletGateOverlay]);

  if (!streams.length) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingHorizontal: spacing.lg,
          justifyContent: 'center',
          gap: spacing.md,
        }}
      >
        <LiveEmptyBroadcastBlock
          subtitle="This show may have ended or is not available yet. Explore listings or start your own broadcast."
        />
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={{
              alignSelf: 'center',
              marginTop: spacing.sm,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
            }}
          >
            <Text style={{ color: colors.gold, fontWeight: '800' }}>Go back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <GestureDetector gesture={showSwipeGesture}>
        <View
          style={styles.feedRoot}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setLayoutSize((prev) =>
                prev?.width === width && prev?.height === height ? prev : { width, height },
              );
            }
          }}
        >
          <PagerView
            ref={pagerRef}
            key={initialStreamId ?? 'default'}
            style={styles.feedPager}
            initialPage={startIndex}
            orientation="vertical"
            scrollEnabled={feedGesturesEnabled}
            onPageScroll={(e) => {
              const { position, offset } = e.nativeEvent;
              if (offset > 0.06 && position + 1 < streams.length) {
                setPeekPage(position + 1);
              } else if (offset < -0.06 && position > 0) {
                setPeekPage(position - 1);
              } else {
                setPeekPage(null);
              }
            }}
            onPageSelected={(e) => {
              setPage(e.nativeEvent.position);
              setPeekPage(null);
            }}
          >
            {streams.map((stream, index) => (
              <View key={stream.id} style={styles.page} collapsable={false}>
                <LiveSlide
                  stream={stream}
                  isActive={index === page}
                  playbackMode={resolvePlaybackMode(index)}
                  stageContainer={stageContainer}
                  screenHeight={viewportHeight}
                  onBack={onBack}
                  signedIn={signedIn}
                  onRequireAuth={onRequireAuth}
                  accessToken={accessToken}
                  userId={userId}
                  onWalletOverlayChange={setWalletOverlayActive}
                  onPaymentBlockerChange={setPaymentBlockerActive}
                  onWalletGateHostChange={handleWalletGateHostChange}
                  roomVisitNonce={roomVisitNonce}
                  onSpotCelebrationHostChange={handleSpotCelebrationHostChange}
                />
              </View>
            ))}
          </PagerView>
        </View>
      </GestureDetector>
      {walletGateHost ? (
        <LiveBuyerWalletGateModal
          visible={walletGateHost.showModal}
          readiness={walletGateHost.readiness}
          onSetupWallet={() => walletGateActionsRef.current?.openSheet()}
          onLeaveRoom={leaveWalletGateRoom}
        />
      ) : null}
      {walletGateHost?.showSheet ? (
        <WalletSheet
          visible
          onClose={() => walletGateActionsRef.current?.closeSheet()}
          accessToken={walletGateHost.accessToken}
          roomId={walletGateHost.roomId}
          initialReadiness={walletGateHost.readiness}
          initialStep={!walletGateHost.readiness.shippingReady ? 'shipping' : 'payment'}
          openPaymentSetupOnMount={
            walletGateHost.readiness.shippingReady && !walletGateHost.readiness.paymentReady
          }
          onReadinessChange={(next) => walletGateActionsRef.current?.onReadinessChange(next)}
          onActiveChange={setWalletOverlayActive}
        />
      ) : null}
      {spotCelebrationHost ? (
        <LiveSpotTakenCelebration
          celebration={spotCelebrationHost.celebration}
          onDone={spotCelebrationHost.clear}
          viewerUsername={spotCelebrationHost.viewerUsername}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  feedRoot: {
    flex: 1,
  },
  feedPager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  slide: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  connectionBanner: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    zIndex: 90,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  connectionBannerTxt: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  outbidToast: {
    position: 'absolute',
    top: 108,
    alignSelf: 'center',
    zIndex: 91,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  outbidToastTxt: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  recoveryToast: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    zIndex: 95,
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18, 16, 10, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.35)',
  },
  recoveryToastTxt: { color: colors.gold, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  stageRoot: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  stageGestureRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  chromeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    overflow: 'hidden',
  },
  stageVideoFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  topBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: 2,
    zIndex: 2,
    paddingRight: spacing.sm,
  },
  backIconOnly: {
    marginRight: 2,
    marginLeft: -4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  hostAvatarTop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  hostAvatarTopCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  hostTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  hostNameTop: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.96)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hostNameTopCompact: {
    fontSize: 13,
  },
  hostSubtitleTop: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.05,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hostSubtitleTopCompact: {
    fontSize: 10,
  },
  hostMetaLine: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.05,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  liveStatusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 2,
  },
  viewersTopRight: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewersTopRightCompact: {
    fontSize: 12,
  },
  endedBadge: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    zIndex: 2,
    paddingTop: 2,
  },
  iconTopBare: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightRail: {
    position: 'absolute',
    right: spacing.sm,
    alignItems: 'center',
    gap: 14,
    zIndex: 5,
  },
  rightRailCompact: {
    gap: 10,
  },
  railBtn: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    minWidth: 48,
  },
  railBtnCompact: {
    minWidth: 44,
    gap: 2,
  },
  railLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  commerceOverlayHost: {
    position: 'absolute',
    zIndex: 12,
    pointerEvents: 'box-none',
  },
  shopModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  shopModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shopDrawer: {
    maxHeight: 340,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'rgba(12,12,12,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  shopDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  shopDrawerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  shopDrawerPinned: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  shopDrawerScroll: {
    maxHeight: 280,
  },
  shopDrawerMuted: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  shopPlaceholderCard: {
    padding: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    gap: spacing.sm,
  },
  shopPlaceholderTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  blockedBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 30,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(76,5,25,0.82)',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockedBannerText: {
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  blockedBannerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
  },
  blockedBannerBtnText: {
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: '800',
  },
  mutedBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mutedBannerText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
