import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostStreamPayload, LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { fetchProfileById } from '../../../api/profilesRepository';
import { useAuth } from '../../../auth/AuthContext';
import {
  CHAT_ZONE_GAP,
  COMPOSER_BAR_H,
  FloatingLiveChat,
} from '../../live/floatingLiveChat';
import { SellerLiveComposer } from './SellerLiveComposer';
import { SellerLiveGestureLayer } from './SellerLiveGestureLayer';
import { AddInventoryModal } from '../liveConsole/AddInventoryModal';
import { EditQueueItemPricingModal } from '../liveConsole/EditQueueItemPricingModal';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { SellerLiveStreamBackdrop } from './SellerLiveStreamBackdrop';
import type { MobileHostBroadcastPhase, SellerCameraPermissionState } from '../../../hooks/useMobileStagePublish';
import type { SellerCameraFacing } from '../../../lib/sellerHostCamera';
import { useSellerLiveConsole } from '../../../hooks/useSellerLiveConsole';
import { webLiveRoomUrl } from '../../../lib/openWebCommerce';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { SellerLiveBroadcastSheet } from './SellerLiveBroadcastSheet';
import { SellerLiveOverlayHeader } from './SellerLiveOverlayHeader';
import {
  SellerLivePinnedOverlay,
  SELLER_PINNED_EMPTY_HEIGHT,
  SELLER_PINNED_EMPTY_WITH_PIN_HEIGHT,
  SELLER_PINNED_OVERLAY_HEIGHT,
} from './SellerLivePinnedOverlay';
import { SellerNextUpRail, SELLER_NEXT_UP_RAIL_HEIGHT } from './SellerNextUpRail';
import { SellerLiveQueueSheet } from './SellerLiveQueueSheet';
import { SellerConsoleActionBar } from './SellerConsoleActionBar';
import { SellerShareSheet } from './SellerShareSheet';
import { colors, radii, spacing } from '../../../theme';

const COMMERCE_TO_COMPOSER_GAP = 10;
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
  const [hostAvatarUrl, setHostAvatarUrl] = useState(
    `https://i.pravatar.cc/120?u=${encodeURIComponent(user?.id ?? 'seller')}`,
  );
  const [hostName, setHostName] = useState('You');
  const [sellerUsername, setSellerUsername] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [biddingUrgent, setBiddingUrgent] = useState(false);

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
    });
  }, [user?.id]);

  const roomLive = host.room?.status === 'live';
  const canStart = host.room?.status === 'scheduled';
  const canEnd = host.room?.status === 'live';
  const streamTitle = host.room?.title ?? 'Live show';
  const publicUrl = webLiveRoomUrl(roomId) ?? '';
  const actionBarTop = insets.top + 56;
  const actionBarHeight = 56;

  const nextUpBottom = Math.max(insets.bottom, spacing.xs);
  const nextQueued = console.items.find((i) => i.status === 'queued') ?? null;
  const showPinCta = !console.activeItem && Boolean(nextQueued) && !console.roomEnded;
  const pinnedOverlayHeight = console.activeItem
    ? SELLER_PINNED_OVERLAY_HEIGHT
    : showPinCta
      ? SELLER_PINNED_EMPTY_WITH_PIN_HEIGHT
      : SELLER_PINNED_EMPTY_HEIGHT;

  const onPinNext = () => {
    if (!nextQueued) return;
    console.onLaunch(nextQueued);
  };
  const pinnedBottom = nextUpBottom + SELLER_NEXT_UP_RAIL_HEIGHT + spacing.xs;
  const composerBottom = pinnedBottom + pinnedOverlayHeight + COMMERCE_TO_COMPOSER_GAP;
  const chatBottom = composerBottom + COMPOSER_BAR_H + CHAT_ZONE_GAP;

  const chatPool = console.chatMessages;

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
        bottom={chatBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        isActive
        streamKey={roomId}
        liveRoomId={roomId}
        hostUserId={user?.id}
        accessToken={accessToken}
        canModerate
        onModerationComplete={() => void console.loadOnce()}
      />

      <SellerLiveComposer
        bottom={composerBottom}
        left={spacing.lg}
        rightEdge={CHAT_RIGHT_EDGE}
        value={chatDraft}
        onChangeText={setChatDraft}
        onSend={() => {
          if (!chatDraft.trim()) return;
          setChatDraft('');
        }}
        sendDisabled
      />

      <SellerNextUpRail
        bottom={nextUpBottom}
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
        onPinNext={showPinCta ? onPinNext : undefined}
      />

      <SellerLivePinnedOverlay
        bottom={pinnedBottom}
        left={spacing.md}
        right={CHAT_RIGHT_EDGE + spacing.sm}
        item={console.activeItem}
        serverNowMs={console.serverNowMs}
        roomLive={console.roomLive}
        busy={console.busy}
        startingAuction={console.startingAuction}
        onStartBidding={console.onStartBidding}
        onSold={console.onSold}
        onSkip={console.onSkip}
        onExtend={console.onExtend}
        onPinNext={showPinCta ? onPinNext : undefined}
        pinNextLabel={nextQueued ? `Pin ${(nextQueued.displayTitle ?? nextQueued.title).trim()}` : undefined}
      />

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
        quickTitle={console.quickTitle}
        onChangeQuickTitle={console.setQuickTitle}
        onClose={() => console.setInventoryOpen(false)}
        onSelect={console.onInventorySelect}
        showAuctionPricing={console.auctionRoom}
        pricingBusy={console.busy}
      />
      <EditQueueItemPricingModal
        item={console.pricingEditItem}
        busy={console.busy}
        onClose={() => console.setPricingEditItem(null)}
        onSave={console.onSaveQueuePricing}
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
