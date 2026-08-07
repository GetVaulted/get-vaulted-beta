import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostStreamPayload, HostConsolePayload, LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { fetchProfileById } from '../../../api/profilesRepository';
import { useAuth } from '../../../auth/AuthContext';
import { KeyboardDismissStageShield } from '../../ui/KeyboardDismissStageShield';
import { FloatingLiveChat, PinnedModeratorBar } from '../../live/floatingLiveChat';
import type { MentionComposerInputHandle } from '../../mentions/MentionComposerInput';
import { appendMentionToDraft, canShowLiveChatBanOption, canShowLiveChatKickOption, canShowLiveChatRemoveKickOption, canShowLiveChatRemoveRoomBanOption, canShowLiveChatRemoveSellerBanOption, promptLiveChatUserAction, type LiveChatModerationActionType } from '../../../lib/liveChatUserActions';
import { applyLiveModerationAction } from '../../../api/trustRepository';
import { openUserProfile } from '../../../navigation/openPlatform';
import {
  computeChatStackMaxHeight,
  computeLiveRoomBottomStack,
  scaledStaffChatToggleHeight,
  scaledComposerBarHeight,
} from '../../../lib/liveRoomBottomLayout';
import { sellerConsoleToolbarScale, liveRoomOverlayScale } from '../../../lib/liveRoomUiScale';
import { SellerLiveComposer } from './SellerLiveComposer';
import { SellerLiveGestureLayer } from './SellerLiveGestureLayer';
import { AddInventoryModal } from '../liveConsole/AddInventoryModal';
import { EditBreakSpotsModal } from '../liveConsole/EditBreakSpotsModal';
import { EditQueueItemPricingModal } from '../liveConsole/EditQueueItemPricingModal';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { SellerLiveStreamBackdrop } from './SellerLiveStreamBackdrop';
import type { MobileHostBroadcastPhase, SellerCameraPermissionState } from '../../../hooks/useMobileStagePublish';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import { liveRoomChatOpen } from '../../../lib/liveRoomChatPolicy';
import { isLiveRoomBroadcastOnAir, isLiveRoomRemotePublisherActive } from '../../../lib/liveRoomBroadcastOnAir';
import { isObsChannelHlsMode } from '../../../lib/liveObsChannelMode';
import { resolveHostVideoFeedStatus } from '../../../lib/hostVideoFeedStatus';
import { useLiveRoomChat } from '../../../hooks/useLiveRoomChat';
import { resolvePinnedModeratorUsername } from '../../../lib/resolvePinnedModeratorUsername';
import { useLiveRoomModeration } from '../../../hooks/useLiveRoomModeration';
import { useRealtimeRoomSubscription } from '../../../hooks/useRealtimeRoomSubscription';
import { parseVaultRevealSpinPayload, VAULT_REVEAL_TOTAL_DISPLAY_MS, vaultRevealDisplayMs, type VaultRevealSpinPayload } from '../../../lib/vaultRevealSpin';
import { VaultRevealOverlay } from '../../live/VaultRevealOverlay';
import { LiveSpotTakenCelebration } from '../../live/LiveSpotTakenCelebration';
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  spotCelebrationDismissKey,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration as SpotTakenCelebration,
} from '../../../lib/liveSpotCelebration';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import { parseVariantPurchasedRandomClaim } from '../../../lib/liveVariantSpotBoard';
import { useSellerLiveConsole } from '../../../hooks/useSellerLiveConsole';
import { useHostGiveawayActions, pickHostStageGiveaway } from '../../../hooks/useHostGiveawayActions';
import { LiveRoomShareSheet } from '../../live/LiveRoomShareSheet';
import {
  shouldShowPreLiveRetryBanner,
} from '../../../lib/livePlaybackAppState';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { SellerLiveBroadcastSheet } from './SellerLiveBroadcastSheet';
import { SellerLiveOverlayHeader } from './SellerLiveOverlayHeader';
import {
  SellerLivePinnedOverlay,
  SELLER_PINNED_EMPTY_HEIGHT,
  SELLER_PINNED_OVERLAY_HEIGHT,
  SELLER_PINNED_RUNNING_HEIGHT,
} from './SellerLivePinnedOverlay';
import { SellerLiveQueueSheet } from './SellerLiveQueueSheet';
import { SellerNextUpRail, SELLER_NEXT_UP_RAIL_HEIGHT } from './SellerNextUpRail';
import { SellerLiveGiveawaySheet } from './SellerLiveGiveawaySheet';
import { SellerConsoleActionBar, sellerHeaderBlockHeight, SELLER_HEADER_TOOLBAR_H } from './SellerConsoleActionBar';
import { SellerHostSideRail } from './SellerHostSideRail';
import { SellerHostGiveawayRail } from './SellerHostGiveawayRail';
import { SellerLiveSalesSheet } from './SellerLiveSalesSheet';
import { LiveShowNotesSheet } from '../../live/LiveShowNotesSheet';
import { hasLiveShowNotes, normalizeLiveShowNotes } from '../../../lib/liveShowNotes';
import { SellerBreakSpotBoardSheet } from './SellerBreakSpotBoardSheet';
import { HostModeratorAssignSheet } from '../../moderator/HostModeratorAssignSheet';
import {
  HostModeratorAssignButton,
  ModeratorToolsButton,
} from '../../moderator/ModeratorFloatingButton';
import { ModeratorActionSheet } from '../../moderator/ModeratorActionSheet';
import { ModeratorDrawer } from '../../moderator/ModeratorDrawer';
import { showModeratorTools, resolveModerationActor } from '../../../lib/liveModeratorPermissions';
import { colors, radii, spacing } from '../../../theme';
import type { ChatMessage } from '../../../types';

const CHAT_RIGHT_EDGE = 88;

type HostActions = {
  room: LiveRoomHostDetail | null;
  stream: HostStreamPayload | null;
  thumbnailUrl: string | null;
  streamConnected: boolean;
  roomError: SanitizedLiveError | null;
  streamWarning: SanitizedLiveError | null;
  readinessBlocked: string[] | null;
  busy: 'provision' | 'rotate' | 'refresh' | 'start' | 'end' | null;
  revealKey: boolean;
  serverUrl: string | null;
  streamKey: string | null;
  onReload: () => void;
  onReloadStream: (sync: boolean) => void;
  onProvision: () => void;
  onRotateKey: () => void;
  onToggleReveal: () => void;
  onStartShow: () => void;
  onEndShow: () => void;
  broadcastPhase: MobileHostBroadcastPhase;
  broadcastError: string | null;
  stageWebrtcEnabled: boolean;
  showCameraPreview: boolean;
  cameraFacing: SellerCameraFacing;
  cameraZoom: number;
  zoomStops: number[];
  onSetCameraZoom: (factor: number) => void;
  cameraPermissionState: SellerCameraPermissionState;
  cameraPermissionError: string | null;
  cameraPermissionRetrying: boolean;
  onRetryCameraPermission: () => void;
  onFlipCamera: () => void;
  microphoneMuted: boolean;
  onToggleMicMute: () => void;
  onStartBroadcast: () => void;
  /** Force teardown + start again (banner Retry). */
  onRetryBroadcast: () => void;
  onStopBroadcast: () => void;
  onPauseBroadcast: () => void;
  onResumeBroadcast: () => void;
};

type Props = {
  navigation: NavigationProp<ParamListBase>;
  roomId: string;
  accessToken: string;
  host: HostActions;
  initialConsole?: HostConsolePayload | null;
};

export function SellerLiveHostView({ navigation, roomId, accessToken, host, initialConsole }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const overlayScale = liveRoomOverlayScale(windowWidth);
  const toolbarScale = sellerConsoleToolbarScale(windowWidth);
  const sellerToolbarHeight = Math.round(SELLER_HEADER_TOOLBAR_H * toolbarScale);
  const composerBarHeight = scaledComposerBarHeight(overlayScale);
  const { user } = useAuth();
  const [hostAvatarUrl, setHostAvatarUrl] = useState<string | null>(null);
  const [hostName, setHostName] = useState('You');
  const [sellerUsername, setSellerUsername] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const [spotCelebration, setSpotCelebration] = useState<SpotTakenCelebration | null>(null);
  const seenSpotCelebrationKeysRef = useRef<Set<string>>(new Set());
  const pendingSpotCelebrationRef = useRef<SpotTakenCelebration | null>(null);
  const pendingSpotCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vaultRevealActiveRef = useRef(false);
  const vaultRevealSpinRef = useRef<VaultRevealSpinPayload | null>(null);

  useEffect(() => {
    vaultRevealSpinRef.current = vaultRevealSpin;
  }, [vaultRevealSpin]);
  const [teamsBoardOpen, setTeamsBoardOpen] = useState(false);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showNotesOpen, setShowNotesOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(() => normalizeLiveShowNotes(host.room?.showNotes));
  const [chatDraft, setChatDraft] = useState('');
  const [staffChatOnly, setStaffChatOnly] = useState(false);
  const chatComposerRef = useRef<MentionComposerInputHandle>(null);
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [modAssignOpen, setModAssignOpen] = useState(false);
  const [modActionMessage, setModActionMessage] = useState<ChatMessage | null>(null);
  const [biddingUrgent, setBiddingUrgent] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [chatExpanded, setChatExpanded] = useState(false);

  useEffect(() => {
    setShowNotes(normalizeLiveShowNotes(host.room?.showNotes));
  }, [host.room?.showNotes, roomId]);

  const roomLive = host.room?.status === 'live';
  const localPublishing =
    host.broadcastPhase === 'live' ||
    host.broadcastPhase === 'paused' ||
    host.broadcastPhase === 'starting' ||
    host.broadcastPhase === 'stopping';
  const roomBroadcastOnAir = useMemo(() => {
    if (!roomLive) return false;
    return isLiveRoomBroadcastOnAir({
      status: 'live',
      streamHealth: host.stream?.streamHealth ?? 'offline',
      streamPaused: host.stream?.streamPaused,
      streamMode: host.stream?.streamMode,
      streamStartedAt: host.stream?.streamStartedAt,
      streamEndedAt: host.stream?.streamEndedAt,
    });
  }, [host.stream, roomLive]);
  /** Commerce gate: this device publishing OR another device already on air (companion). */
  const broadcastOnAir = roomLive && (localPublishing || roomBroadcastOnAir);
  /** Another device is actually publishing — not soft Stage warm-up / stale offline grace. */
  const remotePublisherActive = useMemo(() => {
    if (!roomLive) return false;
    return isLiveRoomRemotePublisherActive({
      status: 'live',
      streamHealth: host.stream?.streamHealth ?? 'offline',
      streamPaused: host.stream?.streamPaused,
      streamMode: host.stream?.streamMode,
      streamStartedAt: host.stream?.streamStartedAt,
      streamEndedAt: host.stream?.streamEndedAt,
    });
  }, [host.stream, roomLive]);
  const obsMode = isObsChannelHlsMode(host.stream?.streamMode);
  /** Room is live from another device / OBS; this phone is queue / start-auction only. */
  const hostCompanionMode = (remotePublisherActive || (obsMode && roomLive)) && !localPublishing;
  /** Header pill — buyer-facing video, not just room status. */
  const videoFeed = useMemo(
    () =>
      resolveHostVideoFeedStatus({
        roomStatus: host.room?.status ?? 'scheduled',
        broadcastPhase: host.broadcastPhase,
        streamPaused: host.stream?.streamPaused,
        companionMode: hostCompanionMode,
        roomBroadcastOnAir,
        streamHealth: host.stream?.streamHealth,
      }),
    [
      host.broadcastPhase,
      host.room?.status,
      host.stream?.streamHealth,
      host.stream?.streamPaused,
      hostCompanionMode,
      roomBroadcastOnAir,
    ],
  );

  const console = useSellerLiveConsole({
    accessToken,
    roomId,
    roomStatus: host.room?.status ?? 'scheduled',
    roomType: host.room?.roomType ?? 'auction',
    sellerUsername,
    navigation,
    broadcastOnAir,
    onBiddingUrgentChange: setBiddingUrgent,
    onAfterAddLot: () => setQueueOpen(true),
    initialConsole,
  });

  const showGiveawayToast = useCallback((message: string) => {
    setShareToast(message);
    setTimeout(() => setShareToast(null), 2400);
  }, []);

  const giveawayActions = useHostGiveawayActions({
    accessToken,
    roomId,
    onRefresh: async () => {
      await console.refreshConsole();
    },
    onToast: showGiveawayToast,
    onDrawSpin: (spin) => {
      if (seenVaultRevealSpinIdsRef.current.has(spin.spinId)) return;
      seenVaultRevealSpinIdsRef.current.add(spin.spinId);
      setVaultRevealSpin(spin);
    },
    onDrawComplete: () => {
      void console.syncSales();
    },
  });

  const activeStageGiveaway = useMemo(
    () => pickHostStageGiveaway(console.giveaways),
    [console.giveaways],
  );

  useEffect(() => {
    if (!user?.id) return;
    void fetchProfileById(user.id).then((p) => {
      if (!p) return;
      if (p.username?.trim()) {
        setSellerUsername(p.username.trim());
        setHostName(p.username.trim());
      } else if (p.display_name?.trim()) {
        setHostName(p.display_name.trim());
      }
      if (p.avatar_url?.trim()) setHostAvatarUrl(p.avatar_url.trim());
      else setHostAvatarUrl(null);
    });
  }, [user?.id]);

  const roomStatus = host.room?.status ?? 'scheduled';
  const roomChatOpen = liveRoomChatOpen(host.room?.status);
  const canHostChat = roomChatOpen || host.broadcastPhase === 'live' || host.streamConnected;
  const canStart = host.room?.status === 'scheduled';
  const canEnd = host.room?.status === 'live';
  const streamTitle = host.room?.title ?? 'Live show';
  const headerPaddingTop = insets.top + 6;
  const hostGivvyRailTop = headerPaddingTop + sellerHeaderBlockHeight(windowWidth) + 4;

  const handleShare = useCallback(() => {
    setShareSheetOpen(true);
  }, []);

  const commerceBottom = Math.max(insets.bottom, spacing.xs);
  const displayItem = console.activeItem;
  const showTeamsBoard = Boolean(displayItem && isVariantSalesFormat(displayItem.salesFormat) && (displayItem.variants?.length ?? 0) > 0);
  const salesAttentionCount = useMemo(() => {
    const failedSales = console.recentSales.filter((r) => r.paymentTone === 'retry').length;
    return console.paymentFailures.length + failedSales;
  }, [console.paymentFailures.length, console.recentSales]);
  const pinnedOverlayEstimate = !displayItem
    ? SELLER_PINNED_EMPTY_HEIGHT
    : displayItem.biddingOpen
      ? SELLER_PINNED_RUNNING_HEIGHT
      : SELLER_PINNED_OVERLAY_HEIGHT;
  const [commerceHeight, setCommerceHeight] = useState(pinnedOverlayEstimate);

  useEffect(() => {
    // Seed from estimate when lot / phase changes; onLayout then measures exact height.
    // Never shrink below the estimate on this tick — that was stacking composer over On Screen.
    setCommerceHeight(pinnedOverlayEstimate);
  }, [displayItem?.id, displayItem?.biddingOpen, pinnedOverlayEstimate]);

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

  const bottomStack = useMemo(
    () =>
      computeLiveRoomBottomStack({
        dockPaddingBottom: commerceBottom,
        commerceHeight,
        keyboardOffset,
        compact: overlayScale <= 1,
        overlayScale,
      }),
    [commerceBottom, commerceHeight, keyboardOffset, overlayScale],
  );

  const nextUpRailBottom = bottomStack.commerceTop + 6;
  const sellerComposerBottom = nextUpRailBottom + SELLER_NEXT_UP_RAIL_HEIGHT + 6;

  const onStartAuction = () => {
    if (console.activeItem) {
      console.onStartBidding();
    }
  };

  const hostChatUsername = sellerUsername?.trim() || hostName;

  const moderation = useLiveRoomModeration({
    roomId,
    accessToken,
    enabled: true,
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
        userId: user?.id,
        sellerIdHint: moderation.sellerId ?? user?.id,
        hostUserIdHint: user?.id,
      }),
    [
      moderation.allowedActions,
      moderation.canModerate,
      moderation.isHost,
      moderation.isModerator,
      moderation.moderatorLevel,
      moderation.sellerId,
      moderation.viewerRole,
      user?.id,
    ],
  );

  const showHostUserId = modActor.showHostUserId;

  const liveChat = useLiveRoomChat({
    roomId,
    hostUsername: hostChatUsername,
    hostUserId: showHostUserId ?? user?.id,
    accessToken,
    enabled: true,
    realtimePrimary: true,
    senderUserId: user?.id,
    senderUsername: sellerUsername ?? hostName,
    senderAvatarUrl: hostAvatarUrl,
  });

  const showSpotCelebration = useCallback((taken: SpotTakenCelebration) => {
    const key = spotCelebrationDismissKey(taken);
    if (seenSpotCelebrationKeysRef.current.has(key)) return;
    seenSpotCelebrationKeysRef.current.add(key);
    setSpotCelebration(taken);
    setTimeout(() => {
      seenSpotCelebrationKeysRef.current.delete(key);
    }, SPOT_CELEBRATION_DISPLAY_MS + 1000);
  }, []);

  const clearPendingSpotCelebrationTimer = useCallback(() => {
    if (pendingSpotCelebrationTimerRef.current) {
      clearTimeout(pendingSpotCelebrationTimerRef.current);
      pendingSpotCelebrationTimerRef.current = null;
    }
  }, []);

  const flushPendingSpotCelebration = useCallback(() => {
    clearPendingSpotCelebrationTimer();
    const pending = pendingSpotCelebrationRef.current;
    if (!pending) return;
    pendingSpotCelebrationRef.current = null;
    showSpotCelebration(pending);
  }, [clearPendingSpotCelebrationTimer, showSpotCelebration]);

  const queueSpotCelebrationAfterReveal = useCallback(
    (taken: SpotTakenCelebration) => {
      pendingSpotCelebrationRef.current = taken;
      clearPendingSpotCelebrationTimer();
      const spin = vaultRevealSpinRef.current;
      const delayMs = (spin ? vaultRevealDisplayMs(spin) : VAULT_REVEAL_TOTAL_DISPLAY_MS) + 600;
      pendingSpotCelebrationTimerRef.current = setTimeout(() => {
        pendingSpotCelebrationTimerRef.current = null;
        flushPendingSpotCelebration();
      }, delayMs);
    },
    [clearPendingSpotCelebrationTimer, flushPendingSpotCelebration],
  );

  const dismissVaultRevealSpin = useCallback(() => {
    vaultRevealActiveRef.current = false;
    setVaultRevealSpin(null);
    flushPendingSpotCelebration();
  }, [flushPendingSpotCelebration]);

  useRealtimeRoomSubscription({
    liveRoomId: roomId,
    enabled: true,
    includeStaffChat: true,
    onLiveRoomMessage: (message) => {
      liveChat.appendBroadcast(message);
    },
    onMessagesRefreshMerge: () => {
      void liveChat.reload();
    },
    onQueueItemsChange: () => {
      console.syncQueue();
    },
    onGiveawaysChange: () => {
      console.syncGiveaways();
    },
    onVaultRevealSpin: (payload) => {
      const spin = parseVaultRevealSpinPayload(payload);
      if (!spin || seenVaultRevealSpinIdsRef.current.has(spin.spinId)) return;
      seenVaultRevealSpinIdsRef.current.add(spin.spinId);
      vaultRevealActiveRef.current = true;
      setVaultRevealSpin(spin);
      console.syncGiveaways();
    },
    onVariantPurchased: (payload) => {
      const taken = parseVariantPurchasedCelebration(payload);
      if (taken) {
        if (payload.randomReveal === true) {
          queueSpotCelebrationAfterReveal(taken);
        } else {
          showSpotCelebration(taken);
        }
      }
      const randomClaim = parseVariantPurchasedRandomClaim(payload);
      if (randomClaim) console.recordRandomSpotClaim(randomClaim.itemId, randomClaim.claim);
      console.syncQueue();
      console.syncSales();
    },
    onPurchaseCompleted: (payload) => {
      const taken = parseAuctionWinSpotCelebration(payload);
      if (taken) showSpotCelebration(taken);
      console.syncQueue();
      console.syncSales();
    },
    onPaymentFailed: (payload) => {
      void console.syncSales();
      const buyer = payload.buyerUsername?.trim() ? `@${payload.buyerUsername.trim()}` : 'A buyer';
      const item = payload.itemTitle?.trim() ? ` — ${payload.itemTitle.trim()}` : '';
      const reason =
        typeof payload.failureReason === 'string' && payload.failureReason.trim()
          ? payload.failureReason.trim()
          : 'Payment could not be completed.';
      Alert.alert(
        'Buyer payment failed',
        `${buyer}${item}\n\n${reason}\n\nOpen Sales to retry or cancel.`,
      );
    },
    onBidPlaced: () => {
      console.syncQueue();
    },
    onActiveItemChanged: () => {
      console.syncQueue();
      void console.syncSales();
    },
    onAuctionStarted: () => {
      console.syncQueue();
    },
  });

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
    const isHost = Boolean(pinnedUserId && user?.id && pinnedUserId === user.id);
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
    user?.id,
  ]);

  const staffToggleHeight = scaledStaffChatToggleHeight(overlayScale, modActor.canModerate);
  const sellerComposerBlockHeight = composerBarHeight + staffToggleHeight;
  const sellerPinnedBarBottom = sellerComposerBottom + sellerComposerBlockHeight + Math.round(6 * overlayScale);
  const sellerPinnedReserve = pinnedModerator
    ? Math.round(62 * overlayScale) + Math.round(6 * overlayScale)
    : 0;
  const sellerChatBottom =
    sellerComposerBottom + sellerComposerBlockHeight + Math.round(12 * overlayScale) + sellerPinnedReserve;
  const chatMaxHeight = computeChatStackMaxHeight({
    slideHeight: windowHeight,
    topReserve: headerPaddingTop + sellerHeaderBlockHeight(windowWidth) + 8,
    chatBottom: sellerChatBottom,
    overlayScale,
    expanded: chatExpanded,
  });

  useEffect(() => {
    setChatExpanded(false);
  }, [roomId]);

  const tagUserInChat = useCallback((username: string) => {
    setChatDraft((prev) => appendMentionToDraft(prev, username));
    requestAnimationFrame(() => chatComposerRef.current?.focus());
  }, []);

  const applyChatUserModeration = useCallback(
    async (actionType: LiveChatModerationActionType, targetUserId: string, username: string) => {
      const label =
        actionType === 'kick'
          ? 'Kicked from show'
          : actionType === 'unkick'
            ? 'Kick removed'
            : actionType === 'room_ban'
              ? 'Banned from show'
              : actionType === 'unban'
                ? 'Room ban removed'
                : actionType === 'seller_stream_unban'
                  ? 'Seller ban removed'
                  : 'Banned from seller shows';
      const result = await applyLiveModerationAction({
        accessToken,
        roomId,
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
    [accessToken, moderation, roomId],
  );

  const onPressChatUser = useCallback(
    (user: { username: string; userId?: string }) => {
      const targetUserId = user.userId?.trim();
      const modArgs = {
        targetUserId,
        hostUserId: showHostUserId,
        allowedActions: modActor.allowedActions,
        isHost: modActor.isHost,
        isModerator: modActor.isModerator,
        canModerate: modActor.canModerate,
        moderatorLevel: modActor.moderatorLevel,
      };
      const canKick = modActor.canModerate && canShowLiveChatKickOption(modArgs);
      const canBanFromShow = modActor.canModerate && canShowLiveChatBanOption(modArgs);
      const canRemoveKick = modActor.canModerate && canShowLiveChatRemoveKickOption(modArgs);
      const canRemoveRoomBan = modActor.canModerate && canShowLiveChatRemoveRoomBanOption(modArgs);
      const canRemoveSellerBan = modActor.canModerate && canShowLiveChatRemoveSellerBanOption(modArgs);

      promptLiveChatUserAction({
        username: user.username,
        userId: targetUserId,
        onTag: tagUserInChat,
        onViewProfile: targetUserId ? (userId) => openUserProfile(userId) : undefined,
        moderation:
          canKick || canBanFromShow || canRemoveKick || canRemoveRoomBan || canRemoveSellerBan
            ? {
                canKickFromShow: canKick,
                canBanFromShow: canBanFromShow,
                canRemoveKick,
                canRemoveRoomBan,
                canRemoveSellerBan,
                onKickFromShow: () => {
                  if (targetUserId) void applyChatUserModeration('kick', targetUserId, user.username);
                },
                onBanFromShow: () => {
                  if (targetUserId) void applyChatUserModeration('room_ban', targetUserId, user.username);
                },
                onRemoveKick: () => {
                  if (targetUserId) void applyChatUserModeration('unkick', targetUserId, user.username);
                },
                onRemoveRoomBan: () => {
                  if (targetUserId) void applyChatUserModeration('unban', targetUserId, user.username);
                },
                onRemoveSellerBan: () => {
                  if (targetUserId) void applyChatUserModeration('seller_stream_unban', targetUserId, user.username);
                },
              }
            : undefined,
      });
    },
    [
      applyChatUserModeration,
      modActor.allowedActions,
      modActor.canModerate,
      modActor.isHost,
      modActor.isModerator,
      modActor.moderatorLevel,
      showHostUserId,
      tagUserInChat,
    ],
  );

  const sendHostChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || liveChat.sending) return;
    if (!canHostChat) {
      Alert.alert('Chat unavailable', 'Chat is closed for this show.');
      return;
    }
    chatComposerRef.current?.dismissSuggestions();
    try {
      const ok = await liveChat.send(text, { staffOnly: staffChatOnly });
      if (ok) {
        setChatDraft('');
        chatComposerRef.current?.blur();
        Keyboard.dismiss();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Chat', msg);
    }
  }, [chatDraft, liveChat, canHostChat, staffChatOnly]);

  const onGoLive = () => {
    if (host.readinessBlocked?.length) {
      Alert.alert('Finish setup', host.readinessBlocked.join('\n'));
      return;
    }
    // OBS / RTMP: open the room only — never auto-publish the phone camera.
    if (isObsChannelHlsMode(host.stream?.streamMode)) {
      if (host.room?.status === 'scheduled') {
        host.onStartShow();
        return;
      }
      Alert.alert(
        'OBS is the camera',
        SELLER_CONSOLE.obsWaitingSignal,
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    if (host.stageWebrtcEnabled) {
      host.onStartBroadcast();
      return;
    }
    host.onStartShow();
  };

  const onTakeOverCamera = () => {
    if (host.readinessBlocked?.length) {
      Alert.alert('Finish setup', host.readinessBlocked.join('\n'));
      return;
    }
    host.onStartBroadcast();
  };

  return (
    <SellerLiveGestureLayer
      onOpenQueue={() => setQueueOpen(true)}
      onOpenBroadcast={() => setBroadcastOpen(true)}
      onSold={() => console.onSold()}
      onSkip={() => console.onSkip()}
      onSync={() => void console.refreshConsole()}
    >
    <View style={styles.root}>
      <KeyboardDismissStageShield active={keyboardOffset > 0} />
      <SellerLiveStreamBackdrop
        thumbnailUrl={host.thumbnailUrl}
        roomLive={roomLive}
        streamConnected={host.streamConnected}
        biddingUrgent={biddingUrgent}
        useStageCamera={host.stageWebrtcEnabled}
        showCameraPreview={host.showCameraPreview}
        cameraFacing={host.cameraFacing}
        permissionState={host.cameraPermissionState}
        permissionError={host.cameraPermissionError}
        onRetryCameraPermission={host.onRetryCameraPermission}
        permissionRetrying={host.cameraPermissionRetrying}
      />

      {host.roomError && !(roomLive && host.stageWebrtcEnabled) ? (
        <View style={[styles.banner, { top: insets.top + 4 }]}>
          <LiveConsoleWarningBanner
            error={host.roomError}
            onRetry={() => {
              if (roomLive) {
                void host.onResumeBroadcast();
                return;
              }
              host.onReload();
            }}
            actionLabel={roomLive ? SELLER_CONSOLE.resumeStream : 'Retry'}
            retrying={host.busy === 'refresh' || host.broadcastPhase === 'starting'}
          />
        </View>
      ) : null}

      {hostCompanionMode && !host.roomError ? (
        <View
          style={[styles.companionBanner, { top: headerPaddingTop + sellerHeaderBlockHeight(windowWidth) + 8 }]}
          pointerEvents="box-none"
        >
          <Text style={styles.companionTitle}>
            {obsMode ? SELLER_CONSOLE.obsLiveBadge : SELLER_CONSOLE.companionBannerTitle}
          </Text>
          <Text style={styles.companionBody}>
            {obsMode ? SELLER_CONSOLE.obsBroadcastHint : SELLER_CONSOLE.companionBannerBody}
          </Text>
        </View>
      ) : null}

      <SellerLiveOverlayHeader
        paddingTop={headerPaddingTop}
        hostName={hostName}
        hostAvatarUrl={hostAvatarUrl}
        streamTitle={streamTitle}
        viewerCount={console.viewerCount}
        streamOnAir={videoFeed.videoOnAir}
        videoFeed={videoFeed}
        liveStartedAt={roomLive ? host.room?.startedAt ?? null : null}
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate('MainTabs', { screen: 'Live', params: { screen: 'LiveDiscovery' } });
        }}
        onBroadcastSettings={() => setBroadcastOpen(true)}
        onEndShow={!host.stageWebrtcEnabled || obsMode ? () => host.onEndShow() : undefined}
        canEnd={canEnd && (!host.stageWebrtcEnabled || obsMode)}
        endBusy={host.busy === 'end'}
        toolbarMinHeight={sellerToolbarHeight}
        toolbar={
          <SellerConsoleActionBar
            embedded
            onSales={() => {
              setSalesOpen(true);
              void console.syncSales();
            }}
            onGivvy={() => setGiveawayOpen(true)}
            salesAttentionCount={salesAttentionCount}
            onObs={() => setBroadcastOpen(true)}
            showTeamsBoard={showTeamsBoard}
            onTeams={() => setTeamsBoardOpen(true)}
            broadcastPhase={host.broadcastPhase}
            roomStatus={roomStatus}
            streamOnAir={broadcastOnAir}
            companionMode={hostCompanionMode}
            obsMode={obsMode}
            canStartRoom={canStart}
            stageEnabled={host.stageWebrtcEnabled}
            cameraReady={host.cameraPermissionState === 'granted'}
            broadcastBusy={
              host.busy === 'start' ||
              host.busy === 'end' ||
              host.busy === 'refresh' ||
              host.cameraPermissionState === 'requesting'
            }
            onGoLive={onGoLive}
            onTakeOverCamera={onTakeOverCamera}
            onStopStream={host.onStopBroadcast}
            onPauseStream={host.onPauseBroadcast}
            onResumeStream={host.onResumeBroadcast}
            streamPaused={host.stream?.streamPaused === true}
            showCameraFlip={host.stageWebrtcEnabled && host.showCameraPreview && !hostCompanionMode}
            cameraFlipDisabled={host.cameraPermissionState !== 'granted' || host.busy === 'end'}
            onFlipCamera={host.onFlipCamera}
            showMicMute={host.stageWebrtcEnabled && host.showCameraPreview && !hostCompanionMode}
            micMuted={host.microphoneMuted}
            micMuteDisabled={host.cameraPermissionState !== 'granted' || host.busy === 'end'}
            onToggleMicMute={host.onToggleMicMute}
          />
        }
      />

      {activeStageGiveaway ? (
        <View style={[styles.hostGivvyRail, { top: hostGivvyRailTop }]} pointerEvents="box-none">
          <SellerHostGiveawayRail
            giveaway={activeStageGiveaway}
            busy={giveawayActions.busy}
            onAction={(id, action) => {
              void giveawayActions.runAction(id, action);
            }}
            onOpenManage={() => setGiveawayOpen(true)}
          />
        </View>
      ) : null}

      <SellerHostSideRail
        bottom={sellerComposerBottom + sellerComposerBlockHeight + spacing.sm}
        onShare={() => void handleShare()}
        onNotes={() => setShowNotesOpen(true)}
        hasNotes={hasLiveShowNotes(showNotes)}
      />

      <FloatingLiveChat
        pool={chatPool}
        hostAvatarUrl={hostAvatarUrl}
        bottom={sellerChatBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        maxHeight={chatMaxHeight}
        compact={overlayScale <= 1}
        isActive
        streamKey={roomId}
        liveRoomId={roomId}
        hostUserId={showHostUserId}
        accessToken={accessToken}
        canModerate={modActor.canModerate}
        isModerator={modActor.isModerator}
        onLongPressMessage={(message) => setModActionMessage(message)}
        onModerationComplete={() => {
          void liveChat.reload();
          void moderation.reload();
          void console.refreshConsole();
        }}
        onPressChatUser={onPressChatUser}
        moderatorUserIds={moderation.moderators.map((m) => m.userId)}
        overlayScale={overlayScale}
        expanded={chatExpanded}
        onToggleExpanded={() => setChatExpanded((prev) => !prev)}
      />

      {pinnedModerator ? (
        <View
          style={{
            position: 'absolute',
            bottom: sellerPinnedBarBottom,
            left: spacing.lg,
            right: CHAT_RIGHT_EDGE,
            zIndex: 17,
          }}
          pointerEvents="none"
        >
          <PinnedModeratorBar pinned={pinnedModerator} compact overlayScale={overlayScale} />
        </View>
      ) : null}

      <SellerLivePinnedOverlay
        bottom={bottomStack.commerceBottom}
        left={spacing.md}
        right={spacing.md}
        item={displayItem}
        serverNowMs={console.serverNowMs}
        roomLive={console.roomLive}
        broadcastOnAir={console.broadcastOnAir}
        busy={console.busy}
        startingAuction={console.startingAuction}
        onStartBidding={onStartAuction}
        onSold={console.onSold}
        onSkip={console.onSkip}
        onExtend={console.onExtend}
        onEditSpots={
          displayItem && isVariantSalesFormat(displayItem.salesFormat)
            ? () => console.openPricingEditor(displayItem)
            : undefined
        }
        onEditLot={
          displayItem && !isVariantSalesFormat(displayItem.salesFormat)
            ? () => console.openPricingEditor(displayItem)
            : undefined
        }
        clutchTimeEnabled={console.hostClutchTimeEnabled}
        onToggleClutchTime={console.toggleHostClutchTime}
        auctionDurationSec={console.hostAuctionDurationSec}
        onAuctionDurationChange={console.setHostAuctionDurationSec}
        hostOverlayMinimal
        onLayoutHeight={(h) => {
          if (h <= 0) return;
          setCommerceHeight((prev) => (Math.abs(h - prev) > 2 ? h : prev));
        }}
      />

      <SellerNextUpRail
        bottom={nextUpRailBottom}
        left={spacing.md}
        right={spacing.md}
        items={console.items}
        queuedCount={console.queuedCount}
        loading={console.loading}
        busy={console.busy}
        roomEnded={console.roomEnded}
        onOpenQueue={() => setQueueOpen(true)}
        onAddItem={() => console.setInventoryOpen(true)}
      />

      <SellerLiveComposer
        bottom={sellerComposerBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={sendHostChat}
        sendDisabled={liveChat.sending || !canHostChat}
        inputDisabled={host.room?.status === 'ended'}
        placeholder={
          staffChatOnly ? 'Staff only…' : canHostChat ? 'Say something' : 'Chat unavailable'
        }
        accessToken={accessToken}
        liveRoomId={roomId}
        inputRef={chatComposerRef}
        overlayScale={overlayScale}
        canUseStaffChat={modActor.canModerate}
        staffOnly={staffChatOnly}
        onStaffOnlyChange={setStaffChatOnly}
        leadingAccessory={
          <>
            {showModeratorTools(modActor.isModerator, modActor.canModerate, modActor.isHost) ? (
              <ModeratorToolsButton onPress={() => setModDrawerOpen(true)} />
            ) : null}
            {modActor.isHost ? (
              <HostModeratorAssignButton onPress={() => setModAssignOpen(true)} />
            ) : null}
          </>
        }
      />

      {showModeratorTools(modActor.isModerator, modActor.canModerate, modActor.isHost) ? (
        <ModeratorDrawer
          visible={modDrawerOpen}
          onClose={() => setModDrawerOpen(false)}
          liveRoomId={roomId}
          moderatorUserId={user?.id}
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

      {modActor.isHost ? (
        <HostModeratorAssignSheet
          visible={modAssignOpen}
          onClose={() => setModAssignOpen(false)}
          liveRoomId={roomId}
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
          hostUserId={showHostUserId}
          onRefresh={() => void moderation.reload()}
        />
      ) : null}

      {modActionMessage && accessToken ? (
        <ModeratorActionSheet
          visible={Boolean(modActionMessage)}
          onClose={() => setModActionMessage(null)}
          liveRoomId={roomId}
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
            void console.refreshConsole();
          }}
        />
      ) : null}

      {/* Pre-live only: idle Retry. While room is live, never show yellow recovery chrome. */}
      {shouldShowPreLiveRetryBanner({
        roomStatus: host.room?.status ?? 'scheduled',
        broadcastPhase: host.broadcastPhase,
        hasBroadcastError: Boolean(host.broadcastError),
      }) ? (
        <View style={[styles.banner, { top: insets.top + 48 }]}>
          <LiveConsoleWarningBanner
            error={{
              userMessage: host.broadcastError || 'Could not start broadcast.',
              devDetail: null,
              isNetwork: false,
            }}
            onRetry={host.onRetryBroadcast}
            retrying={host.busy === 'start' || host.broadcastPhase === 'starting'}
          />
        </View>
      ) : null}

      {host.stageWebrtcEnabled && !roomLive && host.showCameraPreview ? (
        <View style={[styles.previewHint, { top: headerPaddingTop + sellerHeaderBlockHeight(windowWidth) + 6 }]}>
          <Text style={styles.previewHintTxt}>{SELLER_CONSOLE.previewHint}</Text>
        </View>
      ) : null}

      {shareToast ? (
        <View style={[styles.toast, { top: insets.top + 8 }]}>
          <Text style={styles.toastTxt}>{shareToast}</Text>
        </View>
      ) : null}

      <LiveRoomShareSheet
        visible={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        roomId={roomId}
        showTitle={streamTitle}
        hostUsername={sellerUsername ?? user?.email?.split('@')[0] ?? 'Host'}
        hostAvatarUrl={hostAvatarUrl}
        isLive={roomLive}
        accessToken={accessToken}
        canNotifyFollowers={host.room?.discoveryVisibility !== 'private'}
        onToast={(msg) => showGiveawayToast(msg)}
      />

      <LiveShowNotesSheet
        visible={showNotesOpen}
        onClose={() => setShowNotesOpen(false)}
        roomId={roomId}
        mode="edit"
        accessToken={accessToken}
        initialNotes={showNotes}
        onSaved={(next) => setShowNotes(next)}
        onToast={(msg) => {
          setShareToast(msg);
          setTimeout(() => setShareToast(null), 2200);
        }}
      />

      <SellerLiveQueueSheet
        visible={queueOpen}
        onClose={() => setQueueOpen(false)}
        loading={console.loading}
        busy={console.busy}
        items={console.items}
        roomType={host.room?.roomType ?? 'auction'}
        roomEnded={console.roomEnded}
        roomLive={console.roomLive}
        queuedCount={console.queuedCount}
        consoleError={console.consoleError}
        onRetry={() => void console.loadOnce()}
        onPin={(item) => {
          console.onLaunch(item);
          setQueueOpen(false);
        }}
        onRemove={console.onRemove}
        onReorder={console.onReorder}
        onEditPricing={(item) => console.openPricingEditor(item)}
        onAddItem={() => {
          setQueueOpen(false);
          console.setInventoryOpen(true);
        }}
      />

      <SellerLiveGiveawaySheet
        visible={giveawayOpen}
        onClose={() => setGiveawayOpen(false)}
        accessToken={accessToken}
        roomId={roomId}
        giveaways={console.giveaways}
        busy={giveawayActions.busy}
        onRunAction={(id, action) => {
          void giveawayActions.runAction(id, action);
        }}
        onRefresh={async () => {
          await console.refreshConsole();
        }}
        onToast={showGiveawayToast}
      />

      <SellerLiveSalesSheet
        visible={salesOpen}
        onClose={() => setSalesOpen(false)}
        accessToken={accessToken}
        roomId={roomId}
        recentSales={console.recentSales}
        sellerSummary={console.sellerSummary}
        paymentFailures={console.paymentFailures}
        onRefresh={async () => {
          await console.syncSales();
        }}
        onToast={(msg) => {
          setShareToast(msg);
          setTimeout(() => setShareToast(null), 2200);
        }}
      />

      <SellerLiveBroadcastSheet
        visible={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        streamConnected={host.streamConnected}
        serverUrl={host.serverUrl}
        streamKey={host.streamKey}
        revealKey={host.revealKey}
        onToggleReveal={host.onToggleReveal}
        onConnectSource={host.onProvision}
        onRefresh={() => host.onReloadStream(true)}
        onRotateKey={host.onRotateKey}
        busy={
          host.busy === 'provision' || host.busy === 'rotate' || host.busy === 'refresh' ? host.busy : null
        }
        hasIngest={Boolean(host.serverUrl)}
        zoomStops={host.zoomStops}
        cameraZoom={host.cameraZoom}
        onSetZoom={host.onSetCameraZoom}
      />

      <AddInventoryModal
        visible={console.inventoryOpen}
        accessToken={accessToken}
        roomId={roomId}
        onClose={() => console.setInventoryOpen(false)}
        onSubmit={console.onQuickAddLot}
        onSubmitFromShop={console.onSubmitFromShop}
        onImportFromPriorRoom={console.onImportFromPriorRoom}
        busy={console.busy}
      />
      <EditQueueItemPricingModal
        item={console.pricingEditIsBreak ? null : console.pricingEditItem}
        busy={console.busy}
        onClose={() => console.setPricingEditItem(null)}
        onSave={console.onSaveQueuePricing}
      />
      <EditBreakSpotsModal
        item={console.pricingEditIsBreak ? console.pricingEditItem : null}
        busy={console.busy}
        onClose={() => console.setPricingEditItem(null)}
        onSave={console.onSaveBreakSpots}
      />
      <VaultRevealOverlay
        spin={vaultRevealSpin}
        onDismiss={dismissVaultRevealSpin}
        viewerUsername={sellerUsername ?? undefined}
        viewerUserId={user?.id}
      />
      <SellerBreakSpotBoardSheet
        visible={teamsBoardOpen}
        onClose={() => setTeamsBoardOpen(false)}
        item={displayItem}
        accessToken={accessToken}
        canPinTeams={Boolean(
          displayItem?.status === 'active' &&
            displayItem.variantAssignmentMode !== 'random' &&
            isVariantSalesFormat(displayItem.salesFormat),
        )}
        pinningVariantId={console.pinningVariantId}
        onPinTeam={
          displayItem?.variants?.length
            ? (variantId) =>
                console.onPinLiveTeam(
                  displayItem.id,
                  variantId,
                  displayItem.variants!.map((v) => ({ id: v.id })),
                )
            : undefined
        }
        canMarkSold={Boolean(
          displayItem &&
            displayItem.variantAssignmentMode !== 'random' &&
            isVariantSalesFormat(displayItem.salesFormat) &&
            (displayItem.status === 'active' || displayItem.status === 'queued'),
        )}
        markSoldBusy={console.markSoldBusy || console.busy}
        onMarkSold={
          displayItem
            ? ({ variantId, username, priceUsd, settlementMethod, zeroReason, note, label, restoreIfUnavailable }) =>
                console.onMarkSoldLiveTeam({
                  itemId: displayItem.id,
                  variantId,
                  username,
                  label,
                  priceUsd,
                  settlementMethod,
                  zeroReason,
                  note,
                  restoreIfUnavailable,
                })
            : undefined
        }
        onRetireTeam={
          displayItem
            ? ({ variantId, label }) =>
                console.onRetireLiveTeam({
                  itemId: displayItem.id,
                  variantId,
                  label,
                })
            : undefined
        }
        onRestoreTeam={
          displayItem
            ? ({ variantId, label }) =>
                console.onRestoreLiveTeam({
                  itemId: displayItem.id,
                  variantId,
                  label,
                })
            : undefined
        }
      />
      <LiveSpotTakenCelebration
        celebration={spotCelebration}
        onDone={() => setSpotCelebration(null)}
        viewerUsername={sellerUsername ?? undefined}
      />
    </View>
    </SellerLiveGestureLayer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  banner: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 20,
  },
  companionBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 18,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(6,46,36,0.88)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  companionTitle: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  companionBody: {
    marginTop: 4,
    color: 'rgba(236,253,245,0.92)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  previewHint: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 12,
  },
  hostGivvyRail: {
    position: 'absolute',
    right: spacing.sm,
    zIndex: 14,
  },
  previewHintTxt: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 30,
    borderRadius: radii.md,
    backgroundColor: 'rgba(24,24,27,0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toastTxt: {
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
});
