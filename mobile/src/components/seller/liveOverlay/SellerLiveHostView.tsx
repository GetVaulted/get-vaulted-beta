import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostStreamPayload, LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { fetchProfileById } from '../../../api/profilesRepository';
import { useAuth } from '../../../auth/AuthContext';
import { FloatingLiveChat } from '../../live/floatingLiveChat';
import { computeLiveRoomBottomStack } from '../../../lib/liveRoomBottomLayout';
import { SellerLiveComposer } from './SellerLiveComposer';
import { SellerLiveGestureLayer } from './SellerLiveGestureLayer';
import { AddInventoryModal } from '../liveConsole/AddInventoryModal';
import { EditQueueItemPricingModal } from '../liveConsole/EditQueueItemPricingModal';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { SellerLiveStreamBackdrop } from './SellerLiveStreamBackdrop';
import type { MobileHostBroadcastPhase, SellerCameraPermissionState } from '../../../hooks/useMobileStagePublish';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import { liveRoomChatOpen } from '../../../lib/liveRoomChatPolicy';
import { useLiveRoomChat } from '../../../hooks/useLiveRoomChat';
import { useLiveRoomModeration } from '../../../hooks/useLiveRoomModeration';
import { useRealtimeRoomSubscription } from '../../../hooks/useRealtimeRoomSubscription';
import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from '../../../lib/vaultRevealSpin';
import { VaultRevealWheelOverlay } from '../../live/VaultRevealWheelOverlay';
import { useSellerLiveConsole } from '../../../hooks/useSellerLiveConsole';
import { webLiveRoomUrl } from '../../../lib/openWebCommerce';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { SellerLiveBroadcastSheet } from './SellerLiveBroadcastSheet';
import { SellerLiveOverlayHeader } from './SellerLiveOverlayHeader';
import {
  SellerLivePinnedOverlay,
  SELLER_PINNED_EMPTY_HEIGHT,
  SELLER_PINNED_OVERLAY_HEIGHT,
} from './SellerLivePinnedOverlay';
import { SellerLiveQueueSheet } from './SellerLiveQueueSheet';
import { SellerLiveGiveawaySheet } from './SellerLiveGiveawaySheet';
import { SellerConsoleActionBar } from './SellerConsoleActionBar';
import { SellerShareSheet } from './SellerShareSheet';
import { HostModeratorAssignSheet } from '../../moderator/HostModeratorAssignSheet';
import {
  HostModeratorAssignButton,
  ModeratorToolsButton,
} from '../../moderator/ModeratorFloatingButton';
import { ModeratorDrawer } from '../../moderator/ModeratorDrawer';
import { showModeratorTools } from '../../../lib/liveModeratorPermissions';
import { colors, radii, spacing } from '../../../theme';

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
  onStartBroadcast: () => void;
  onStopBroadcast: () => void;
};

type Props = {
  navigation: NavigationProp<ParamListBase>;
  roomId: string;
  accessToken: string;
  host: HostActions;
};

export function SellerLiveHostView({ navigation, roomId, accessToken, host }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [hostAvatarUrl, setHostAvatarUrl] = useState<string | null>(null);
  const [hostName, setHostName] = useState('You');
  const [sellerUsername, setSellerUsername] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [giveawayBusy, setGiveawayBusy] = useState(false);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [modAssignOpen, setModAssignOpen] = useState(false);
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
  const roomChatOpen = liveRoomChatOpen(host.room?.status);
  const canHostChat = roomChatOpen || host.broadcastPhase === 'live' || host.streamConnected;
  const canStart = host.room?.status === 'scheduled';
  const canEnd = host.room?.status === 'live';
  const streamTitle = host.room?.title ?? 'Live show';
  const publicUrl = webLiveRoomUrl(roomId) ?? '';
  const actionBarTop = insets.top + 56;
  const actionBarHeight = 56;

  const commerceBottom = Math.max(insets.bottom, spacing.xs);
  const nextQueued = console.items.find((i) => i.status === 'queued') ?? null;
  const queuePreview = !console.activeItem && Boolean(nextQueued) && !console.roomEnded;
  const displayItem = console.activeItem ?? (queuePreview ? nextQueued : null);
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
  const liveChat = useLiveRoomChat({
    roomId,
    hostUsername: hostChatUsername,
    accessToken,
    enabled: true,
    realtimePrimary: true,
  });

  const moderation = useLiveRoomModeration({
    roomId,
    accessToken,
    enabled: true,
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
  });

  const chatPool = liveChat.messages;

  const sendHostChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || liveChat.sending) return;
    if (!canHostChat) {
      Alert.alert('Chat unavailable', 'Chat is closed for this show.');
      return;
    }
    try {
      const ok = await liveChat.send(text);
      if (ok) setChatDraft('');
    } catch (e) {
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
      onSync={() => void console.loadOnce()}
    >
    <View style={styles.root}>
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
        roomLive={roomLive}
        onBack={() => navigation.goBack()}
        onBroadcastSettings={() => setBroadcastOpen(true)}
        onEndShow={() => host.onEndShow()}
        canEnd={canEnd}
        endBusy={host.busy === 'end'}
      />

      <SellerConsoleActionBar
        top={actionBarTop}
        onShare={() => setShareOpen(true)}
        onAddItem={() => console.setInventoryOpen(true)}
        onGiveaways={() => setGiveawayOpen(true)}
        onObs={() => setBroadcastOpen(true)}
        broadcastPhase={host.broadcastPhase}
        roomLive={roomLive}
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
      />

      <FloatingLiveChat
        pool={chatPool}
        hostAvatarUrl={hostAvatarUrl}
        bottom={bottomStack.chatBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        isActive
        streamKey={roomId}
        liveRoomId={roomId}
        hostUserId={user?.id}
        accessToken={accessToken}
        canModerate={moderation.canModerate}
        isModerator={moderation.isModerator}
        onModerationComplete={() => {
          void liveChat.reload();
          void moderation.reload();
          void console.loadOnce();
        }}
      />

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
        hostOverlayMinimal
        queuePreview={queuePreview}
        onLayoutHeight={(h) => {
          if (h > 0 && Math.abs(h - commerceHeight) > 2) setCommerceHeight(h);
        }}
      />

      <SellerLiveComposer
        bottom={bottomStack.composerBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={sendHostChat}
        sendDisabled={liveChat.sending || !canHostChat}
        inputDisabled={host.room?.status === 'ended'}
        placeholder={canHostChat ? 'Say something' : 'Chat unavailable'}
        accessToken={accessToken}
        leadingAccessory={
          <>
            {showModeratorTools(moderation.isModerator) ? (
              <ModeratorToolsButton onPress={() => setModDrawerOpen(true)} />
            ) : null}
            {moderation.isHost ? (
              <HostModeratorAssignButton onPress={() => setModAssignOpen(true)} />
            ) : null}
          </>
        }
      />

      {showModeratorTools(moderation.isModerator) ? (
        <ModeratorDrawer
          visible={modDrawerOpen}
          onClose={() => setModDrawerOpen(false)}
          liveRoomId={roomId}
          hostUserId={user?.id}
          accessToken={accessToken}
          moderation={moderation}
          onRefresh={() => {
            void moderation.reload();
            void liveChat.reload();
          }}
        />
      ) : null}

      {moderation.isHost ? (
        <HostModeratorAssignSheet
          visible={modAssignOpen}
          onClose={() => setModAssignOpen(false)}
          liveRoomId={roomId}
          accessToken={accessToken}
          moderation={moderation}
          hostUserId={user?.id}
          onRefresh={() => void moderation.reload()}
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
        onEditPricing={(item) => console.setPricingEditItem(item)}
      />

      <SellerLiveGiveawaySheet
        visible={giveawayOpen}
        onClose={() => setGiveawayOpen(false)}
        accessToken={accessToken}
        roomId={roomId}
        giveaways={console.giveaways}
        busy={console.busy || giveawayBusy}
        onRefresh={async () => {
          await console.loadOnce();
        }}
        onBusyChange={setGiveawayBusy}
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

      <SellerShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        publicUrl={publicUrl}
        showTitle={streamTitle}
        onToast={(msg) => {
          setShareToast(msg);
          setTimeout(() => setShareToast(null), 2200);
        }}
      />

      <AddInventoryModal
        visible={console.inventoryOpen}
        accessToken={accessToken}
        onClose={() => console.setInventoryOpen(false)}
        onSubmit={console.onQuickAddLot}
        busy={console.busy}
      />
      <EditQueueItemPricingModal
        item={console.pricingEditItem}
        busy={console.busy}
        onClose={() => console.setPricingEditItem(null)}
        onSave={console.onSaveQueuePricing}
      />
      <VaultRevealWheelOverlay spin={vaultRevealSpin} onDismiss={() => setVaultRevealSpin(null)} />
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
