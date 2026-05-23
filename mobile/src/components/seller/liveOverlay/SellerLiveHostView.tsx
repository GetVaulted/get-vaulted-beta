import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostStreamPayload, LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { fetchProfileById } from '../../../api/profilesRepository';
import { useAuth } from '../../../auth/AuthContext';
import {
  CHAT_ZONE_GAP,
  COMPOSER_BAR_H,
  FloatingLiveChat,
  useComposerPlaceholderCycle,
} from '../../live/floatingLiveChat';
import { SellerLiveComposer } from './SellerLiveComposer';
import { SellerLiveGestureLayer } from './SellerLiveGestureLayer';
import { AddInventoryModal } from '../liveConsole/AddInventoryModal';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { useSellerLiveConsole } from '../../../hooks/useSellerLiveConsole';
import { colors, radii, spacing } from '../../../theme';
import { SellerLiveBroadcastSheet } from './SellerLiveBroadcastSheet';
import { SellerLiveOverlayHeader } from './SellerLiveOverlayHeader';
import { SellerLiveOverlayRail } from './SellerLiveOverlayRail';
import { SellerLivePinnedOverlay, SELLER_PINNED_OVERLAY_HEIGHT } from './SellerLivePinnedOverlay';
import { SellerLiveQueueSheet } from './SellerLiveQueueSheet';
import { SellerLiveStreamBackdrop } from './SellerLiveStreamBackdrop';

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

  const dockBottom = Math.max(insets.bottom + 12, spacing.md);
  const commerceBottom = dockBottom;
  const composerBottom = commerceBottom + SELLER_PINNED_OVERLAY_HEIGHT + COMMERCE_TO_COMPOSER_GAP;
  const chatBottom = composerBottom + COMPOSER_BAR_H + CHAT_ZONE_GAP;
  const railBottom = commerceBottom + SELLER_PINNED_OVERLAY_HEIGHT + spacing.sm;

  const composerPlaceholderIdx = useComposerPlaceholderCycle(true, chatDraft);

  const chatPool = console.chatMessages;

  const onGoLive = () => {
    if (host.readinessBlocked?.length) {
      Alert.alert('Finish setup', host.readinessBlocked.join('\n'));
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

      <SellerLiveOverlayRail
        bottom={railBottom}
        streamTitle={streamTitle}
        showPromote={false}
        onShare={() => undefined}
        onClip={() => undefined}
        onPromote={() => undefined}
        onQueue={() => setQueueOpen(true)}
        onInventory={() => console.setInventoryOpen(true)}
        onCamera={() => setBroadcastOpen(true)}
      />

      {chatPool.length > 0 ? (
        <FloatingLiveChat
          pool={chatPool}
          hostAvatarUrl={hostAvatarUrl}
          bottom={chatBottom}
          left={spacing.lg}
          rightEdge={CHAT_RIGHT_EDGE}
          isActive
          streamKey={roomId}
        />
      ) : null}

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
        placeholderIndex={composerPlaceholderIdx}
        onQuickReaction={(e) => setChatDraft((d) => (d.trim() ? `${d.trim()} ${e}` : e))}
        onEmojiPress={() => setChatDraft((d) => (d.trim() ? `${d.trim()} 😊` : '😊'))}
      />

      <SellerLivePinnedOverlay
        bottom={commerceBottom}
        left={spacing.md}
        right={spacing.md}
        item={console.activeItem}
        serverNowMs={console.serverNowMs}
        roomLive={console.roomLive}
        auctionRoom={console.auctionRoom}
        busy={console.busy}
        onStartBidding={console.onStartBidding}
        onSold={console.onSold}
        onSkip={console.onSkip}
        onExtend={console.onExtend}
      />

      {canStart ? (
        <Pressable
          style={[styles.goLive, { bottom: commerceBottom + SELLER_PINNED_OVERLAY_HEIGHT + 72 }]}
          onPress={onGoLive}
          disabled={host.busy === 'start'}
        >
          <LinearGradient
            colors={['#E8C872', colors.gold, '#9A7B2E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {host.busy === 'start' ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.goLiveTxt}>Go live</Text>
          )}
        </Pressable>
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
        onLaunch={console.onLaunch}
        onRemove={console.onRemove}
        onReorder={console.onReorder}
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
        quickTitle={console.quickTitle}
        onChangeQuickTitle={console.setQuickTitle}
        onClose={() => console.setInventoryOpen(false)}
        onSelect={console.onInventorySelect}
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
  goLive: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.pill,
    overflow: 'hidden',
    minWidth: 160,
    alignItems: 'center',
    zIndex: 16,
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  goLiveTxt: {
    fontWeight: '900',
    fontSize: 16,
    color: '#0a0a0a',
    letterSpacing: 0.3,
  },
});
