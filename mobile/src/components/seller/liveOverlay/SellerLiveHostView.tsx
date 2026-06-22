import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostStreamPayload, HostConsolePayload, LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { fetchProfileById } from '../../../api/profilesRepository';
import { useAuth } from '../../../auth/AuthContext';
import { KeyboardDismissStageShield } from '../../ui/KeyboardDismissStageShield';
import { FloatingLiveChat, PinnedModeratorBar } from '../../live/floatingLiveChat';
import type { MentionComposerInputHandle } from '../../mentions/MentionComposerInput';
import { appendMentionToDraft, promptLiveChatUserAction } from '../../../lib/liveChatUserActions';
import { openUserProfile } from '../../../navigation/openPlatform';
import {
  computeLiveRoomBottomStack,
  COMPOSER_BAR_HEIGHT,
  PINNED_ABOVE_COMPOSER_GAP,
  PINNED_MODERATOR_ROW_HEIGHT,
} from '../../../lib/liveRoomBottomLayout';
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
import { useLiveRoomChat } from '../../../hooks/useLiveRoomChat';
import { resolvePinnedModeratorUsername } from '../../../lib/resolvePinnedModeratorUsername';
import { useLiveRoomModeration } from '../../../hooks/useLiveRoomModeration';
import { useRealtimeRoomSubscription } from '../../../hooks/useRealtimeRoomSubscription';
import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from '../../../lib/vaultRevealSpin';
import { VaultRevealOverlay } from '../../live/VaultRevealOverlay';
import { LiveSpotTakenCelebration } from '../../live/LiveSpotTakenCelebration';
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  type LiveSpotTakenCelebration as SpotTakenCelebration,
} from '../../../lib/liveSpotCelebration';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import { parseVariantPurchasedRandomClaim } from '../../../lib/liveVariantSpotBoard';
import { useSellerLiveConsole } from '../../../hooks/useSellerLiveConsole';
import { shareLiveRoomNative } from '../../../lib/shareLiveRoomNative';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { SellerLiveBroadcastSheet } from './SellerLiveBroadcastSheet';
import { SellerLiveOverlayHeader } from './SellerLiveOverlayHeader';
import {
  SellerLivePinnedOverlay,
  SELLER_PINNED_EMPTY_HEIGHT,
  SELLER_PINNED_OVERLAY_HEIGHT,
} from './SellerLivePinnedOverlay';
import { SellerLiveQueueSheet } from './SellerLiveQueueSheet';
import { SellerNextUpRail, SELLER_NEXT_UP_RAIL_HEIGHT } from './SellerNextUpRail';
import { SellerLiveGiveawaySheet } from './SellerLiveGiveawaySheet';
import { SellerConsoleActionBar } from './SellerConsoleActionBar';
import { SellerHostSideRail } from './SellerHostSideRail';
import { SellerLiveSalesSheet } from './SellerLiveSalesSheet';
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
  cameraPermissionState: SellerCameraPermissionState;
  cameraPermissionError: string | null;
  cameraPermissionRetrying: boolean;
  onRetryCameraPermission: () => void;
  onFlipCamera: () => void;
  microphoneMuted: boolean;
  onToggleMicMute: () => void;
  onStartBroadcast: () => void;
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
  const { user } = useAuth();
  const [hostAvatarUrl, setHostAvatarUrl] = useState<string | null>(null);
  const [hostName, setHostName] = useState('You');
  const [sellerUsername, setSellerUsername] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [giveawayBusy, setGiveawayBusy] = useState(false);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const [spotCelebration, setSpotCelebration] = useState<SpotTakenCelebration | null>(null);
  const [teamsBoardOpen, setTeamsBoardOpen] = useState(false);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const chatComposerRef = useRef<MentionComposerInputHandle>(null);
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [modAssignOpen, setModAssignOpen] = useState(false);
  const [modActionMessage, setModActionMessage] = useState<ChatMessage | null>(null);
  const [biddingUrgent, setBiddingUrgent] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const console = useSellerLiveConsole({
    accessToken,
    roomId,
    roomStatus: host.room?.status ?? 'scheduled',
    roomType: host.room?.roomType ?? 'auction',
    sellerUsername,
    navigation,
    onBiddingUrgentChange: setBiddingUrgent,
    onAfterAddLot: () => setQueueOpen(true),
    initialConsole,
  });

  useEffect(() => {
    if (!user?.id) return;
    void fetchProfileById(user.id).then((p) => {
      if (!p) return;
      if (p.username?.trim()) setSellerUsername(p.username.trim());
      if (p.display_name?.trim()) setHostName(p.display_name.trim());
      else if (p.username?.trim()) setHostName(p.username.trim());
      if (p.avatar_url?.trim()) setHostAvatarUrl(p.avatar_url.trim());
      else setHostAvatarUrl(null);
    });
  }, [user?.id]);

  const roomLive = host.room?.status === 'live';
  const roomStatus = host.room?.status ?? 'scheduled';
  const streamOnAir =
    host.broadcastPhase === 'live' ||
    host.broadcastPhase === 'paused' ||
    host.broadcastPhase === 'starting';
  const roomChatOpen = liveRoomChatOpen(host.room?.status);
  const canHostChat = roomChatOpen || host.broadcastPhase === 'live' || host.streamConnected;
  const canStart = host.room?.status === 'scheduled';
  const canEnd = host.room?.status === 'live';
  const streamTitle = host.room?.title ?? 'Live show';
  const actionBarTop = insets.top + 56;
  const actionBarHeight = 56;

  const handleShare = useCallback(async () => {
    const shared = await shareLiveRoomNative({
      roomId,
      showTitle: streamTitle,
      hostUsername: sellerUsername ?? user?.email?.split('@')[0] ?? 'Host',
      isLive: roomLive,
    });
    if (shared) {
      setShareToast('Shared.');
      setTimeout(() => setShareToast(null), 2200);
    }
  }, [roomId, roomLive, sellerUsername, streamTitle, user?.email]);

  const commerceBottom = Math.max(insets.bottom, spacing.xs);
  const nextQueued = console.items.find((i) => i.status === 'queued') ?? null;
  const queuePreview = !console.activeItem && Boolean(nextQueued) && !console.roomEnded;
  const displayItem = console.activeItem ?? (queuePreview ? nextQueued : null);
  const showTeamsBoard = Boolean(displayItem && isVariantSalesFormat(displayItem.salesFormat) && (displayItem.variants?.length ?? 0) > 0);
  const salesAttentionCount = useMemo(() => {
    const pendingSales = console.recentSales.filter(
      (r) => r.paymentTone === 'retry' || r.paymentTone === 'pending',
    ).length;
    return console.paymentFailures.length + pendingSales;
  }, [console.paymentFailures.length, console.recentSales]);
  const pinnedOverlayEstimate =
    displayItem || queuePreview ? SELLER_PINNED_OVERLAY_HEIGHT : SELLER_PINNED_EMPTY_HEIGHT;
  const [commerceHeight, setCommerceHeight] = useState(pinnedOverlayEstimate);

  useEffect(() => {
    setCommerceHeight(pinnedOverlayEstimate);
  }, [pinnedOverlayEstimate]);

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
        compact: true,
      }),
    [commerceBottom, commerceHeight, keyboardOffset],
  );

  const nextUpRailBottom = bottomStack.commerceTop + 6;
  const sellerComposerBottom = nextUpRailBottom + SELLER_NEXT_UP_RAIL_HEIGHT + 6;

  const onStartAuction = () => {
    if (console.activeItem) {
      console.onStartBidding();
      return;
    }
    if (nextQueued) {
      console.onLaunchAndStart(nextQueued);
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

  useRealtimeRoomSubscription({
    liveRoomId: roomId,
    enabled: true,
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
      setVaultRevealSpin(spin);
      console.syncGiveaways();
    },
    onVariantPurchased: (payload) => {
      const taken = parseVariantPurchasedCelebration(payload);
      if (taken) setSpotCelebration(taken);
      const randomClaim = parseVariantPurchasedRandomClaim(payload);
      if (randomClaim) console.recordRandomSpotClaim(randomClaim.itemId, randomClaim.claim);
      console.syncQueue();
      console.syncSales();
    },
    onPurchaseCompleted: (payload) => {
      const taken = parseAuctionWinSpotCelebration(payload);
      if (taken) setSpotCelebration(taken);
      console.syncQueue();
      console.syncSales();
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

  const sellerPinnedBarBottom = sellerComposerBottom + COMPOSER_BAR_HEIGHT + PINNED_ABOVE_COMPOSER_GAP;
  const sellerPinnedReserve = pinnedModerator
    ? PINNED_MODERATOR_ROW_HEIGHT + PINNED_ABOVE_COMPOSER_GAP
    : 0;
  const sellerChatBottom = sellerComposerBottom + COMPOSER_BAR_HEIGHT + 12 + sellerPinnedReserve;

  const tagUserInChat = useCallback((username: string) => {
    setChatDraft((prev) => appendMentionToDraft(prev, username));
    requestAnimationFrame(() => chatComposerRef.current?.focus());
  }, []);

  const onPressChatUser = useCallback(
    (user: { username: string; userId?: string }) => {
      promptLiveChatUserAction({
        username: user.username,
        userId: user.userId,
        onTag: tagUserInChat,
        onViewProfile: user.userId ? (userId) => openUserProfile(userId) : undefined,
      });
    },
    [tagUserInChat],
  );

  const sendHostChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || liveChat.sending) return;
    if (!canHostChat) {
      Alert.alert('Chat unavailable', 'Chat is closed for this show.');
      return;
    }
    chatComposerRef.current?.dismissSuggestions();
    setChatDraft('');
    try {
      const ok = await liveChat.send(text);
      if (ok) {
        chatComposerRef.current?.blur();
        Keyboard.dismiss();
      }
    } catch (e) {
      setChatDraft(text);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Chat', msg);
    }
  }, [chatDraft, liveChat, canHostChat]);

  const onGoLive = () => {
    if (host.readinessBlocked?.length) {
      Alert.alert('Finish setup', host.readinessBlocked.join('\n'));
      return;
    }
    if (host.stageWebrtcEnabled) {
      host.onStartBroadcast();
      return;
    }
    host.onStartShow();
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

      {host.roomError ? (
        <View style={[styles.banner, { top: insets.top + 4 }]}>
          <LiveConsoleWarningBanner
            error={host.roomError}
            onRetry={() => host.onReload()}
          />
        </View>
      ) : null}

      <SellerLiveOverlayHeader
        paddingTop={insets.top + 6}
        hostName={hostName}
        hostAvatarUrl={hostAvatarUrl}
        streamTitle={streamTitle}
        viewerCount={console.viewerCount}
        streamOnAir={streamOnAir}
        onBack={() => navigation.goBack()}
        onBroadcastSettings={() => setBroadcastOpen(true)}
        onEndShow={host.stageWebrtcEnabled ? undefined : () => host.onEndShow()}
        canEnd={canEnd && !host.stageWebrtcEnabled}
        endBusy={host.busy === 'end'}
      />

      <SellerConsoleActionBar
        top={actionBarTop}
        onSales={() => {
          setSalesOpen(true);
          void console.syncSales();
        }}
        salesAttentionCount={salesAttentionCount}
        onGiveaways={() => setGiveawayOpen(true)}
        onObs={() => setBroadcastOpen(true)}
        showTeamsBoard={showTeamsBoard}
        onTeams={() => setTeamsBoardOpen(true)}
        broadcastPhase={host.broadcastPhase}
        roomStatus={roomStatus}
        streamOnAir={streamOnAir}
        canStartRoom={canStart}
        stageEnabled={host.stageWebrtcEnabled}
        cameraReady={host.cameraPermissionState === 'granted'}
        broadcastBusy={
          host.busy === 'start' ||
          host.busy === 'end' ||
          host.cameraPermissionState === 'requesting'
        }
        onGoLive={onGoLive}
        onStopStream={host.onStopBroadcast}
        viewerCount={console.viewerCount}
        showCameraFlip={host.stageWebrtcEnabled && host.showCameraPreview}
        cameraFlipDisabled={host.cameraPermissionState !== 'granted' || host.busy === 'end'}
        onFlipCamera={host.onFlipCamera}
        showMicMute={host.stageWebrtcEnabled && host.showCameraPreview}
        micMuted={host.microphoneMuted}
        micMuteDisabled={host.cameraPermissionState !== 'granted' || host.busy === 'end'}
        onToggleMicMute={host.onToggleMicMute}
      />

      <SellerHostSideRail
        bottom={sellerComposerBottom + COMPOSER_BAR_HEIGHT + spacing.sm}
        onShare={() => void handleShare()}
      />

      <FloatingLiveChat
        pool={chatPool}
        hostAvatarUrl={hostAvatarUrl}
        bottom={sellerChatBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
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
          <PinnedModeratorBar pinned={pinnedModerator} compact />
        </View>
      ) : null}

      <SellerLivePinnedOverlay
        bottom={bottomStack.commerceBottom}
        left={spacing.md}
        right={spacing.md}
        item={displayItem}
        serverNowMs={console.serverNowMs}
        roomLive={console.roomLive}
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
        clutchTimeEnabled={console.hostClutchTimeEnabled}
        onToggleClutchTime={console.toggleHostClutchTime}
        hostOverlayMinimal
        queuePreview={queuePreview}
        onLayoutHeight={(h) => {
          if (h > 0 && Math.abs(h - commerceHeight) > 2) setCommerceHeight(h);
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
        roomLive={console.roomLive}
        onOpenQueue={() => setQueueOpen(true)}
        onAddItem={() => console.setInventoryOpen(true)}
        onPinNext={onStartAuction}
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
        placeholder={canHostChat ? 'Say something' : 'Chat unavailable'}
        accessToken={accessToken}
        inputRef={chatComposerRef}
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

      {modActionMessage && showModeratorTools(modActor.isModerator, modActor.canModerate, modActor.isHost) ? (
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

      {host.broadcastError && host.broadcastPhase === 'idle' ? (
        <View style={[styles.banner, { top: insets.top + 48 }]}>
          <LiveConsoleWarningBanner
            error={{
              userMessage: host.broadcastError,
              devDetail: null,
              isNetwork: false,
            }}
            onRetry={host.onStartBroadcast}
          />
        </View>
      ) : null}

      {host.stageWebrtcEnabled && !roomLive && host.showCameraPreview ? (
        <View style={[styles.previewHint, { top: actionBarTop + actionBarHeight + 6 }]}>
          <Text style={styles.previewHintTxt}>{SELLER_CONSOLE.previewHint}</Text>
        </View>
      ) : null}

      {shareToast ? (
        <View style={[styles.toast, { top: insets.top + 8 }]}>
          <Text style={styles.toastTxt}>{shareToast}</Text>
        </View>
      ) : null}

      <SellerLiveQueueSheet
        visible={queueOpen}
        onClose={() => setQueueOpen(false)}
        loading={console.loading}
        busy={console.busy}
        items={console.items}
        roomType={host.room?.roomType ?? 'auction'}
        roomEnded={console.roomEnded}
        queuedCount={console.queuedCount}
        consoleError={console.consoleError}
        onRetry={() => void console.loadOnce()}
        onLaunch={(item) => {
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
        busy={console.busy || giveawayBusy}
        onRefresh={async () => {
          await console.refreshConsole();
        }}
        onBusyChange={setGiveawayBusy}
        onToast={(msg) => {
          setShareToast(msg);
          setTimeout(() => setShareToast(null), 2200);
        }}
      />

      <SellerLiveSalesSheet
        visible={salesOpen}
        onClose={() => setSalesOpen(false)}
        accessToken={accessToken}
        roomId={roomId}
        recentSales={console.recentSales}
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
      />

      <AddInventoryModal
        visible={console.inventoryOpen}
        accessToken={accessToken}
        onClose={() => console.setInventoryOpen(false)}
        onSubmit={console.onQuickAddLot}
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
      <VaultRevealOverlay spin={vaultRevealSpin} onDismiss={() => setVaultRevealSpin(null)} />
      <LiveSpotTakenCelebration celebration={spotCelebration} onDone={() => setSpotCelebration(null)} />
      <SellerBreakSpotBoardSheet
        visible={teamsBoardOpen}
        onClose={() => setTeamsBoardOpen(false)}
        item={displayItem}
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
  previewHint: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 12,
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
