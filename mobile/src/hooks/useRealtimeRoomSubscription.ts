import { useEffect, useLayoutEffect, useRef } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { roomChannel, RT_EVENT, RT_EVENT_ALIASES, type RoomBroadcastPayload } from '../lib/realtimeChannels';

export type LiveRoomChatBroadcastMessage = {
  id: string;
  body: string;
  senderId?: string;
  senderUsername?: string;
  senderAvatarUrl?: string | null;
  messageType?: string;
  createdAt?: string;
  mentions?: { userId: string; username: string }[];
};

export function useRealtimeRoomSubscription(opts: {
  liveRoomId: string | null;
  enabled?: boolean;
  onLiveRoomMessage: (message: LiveRoomChatBroadcastMessage) => void;
  onMessagesRefreshMerge: () => void | Promise<void>;
  onQueueItemsChange?: () => void | Promise<void>;
  onGiveawaysChange?: () => void | Promise<void>;
  onVaultRevealSpin?: (payload: Record<string, unknown>) => void | Promise<void>;
  onBreakSpotsChange?: () => void | Promise<void>;
  onListingBid?: (listingId: string) => void | Promise<void>;
  onTeamBoardChange?: () => void | Promise<void>;
  onRoomStateEvent?: () => void | Promise<void>;
  onBidPlaced?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onActiveItemChanged?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onAuctionStarted?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onAuctionEnded?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onPurchaseCompleted?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onPaymentFailed?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onPaymentRecovered?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onStreamStatusChange?: (payload: RoomBroadcastPayload) => void | Promise<void>;
  onReconnect?: () => void | Promise<void>;
  onConnectionStateChange?: (state: { status: string; reconnectCount: number }) => void;
}): void {
  const refs = useRef(opts);
  useLayoutEffect(() => {
    refs.current = opts;
  });

  useEffect(() => {
    if (!opts.enabled || !opts.liveRoomId || !isSupabaseConfigured()) return undefined;
    const supabase = getSupabase();
    if (!supabase) return undefined;

    const name = roomChannel(opts.liveRoomId);
    const channel = supabase.channel(name);

    const chatEvents = [RT_EVENT.chatMessage, ...(RT_EVENT_ALIASES.chatMessage ?? [])];
    for (const eventName of chatEvents) {
      channel.on('broadcast', { event: eventName }, ({ payload }) => {
        const m = (payload as { message?: LiveRoomChatBroadcastMessage } | null)?.message;
        if (m && typeof m.id === 'string') refs.current.onLiveRoomMessage(m);
      });
    }

    channel
      .on('broadcast', { event: RT_EVENT.messagesRefresh }, () => void refs.current.onMessagesRefreshMerge())
      .on('broadcast', { event: RT_EVENT.auctionStarted }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onAuctionStarted) void refs.current.onAuctionStarted(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on('broadcast', { event: RT_EVENT.auctionEnded }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onAuctionEnded) void refs.current.onAuctionEnded(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on('broadcast', { event: RT_EVENT.activeItemChanged }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onActiveItemChanged) void refs.current.onActiveItemChanged(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on('broadcast', { event: RT_EVENT.purchaseCompleted }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onPurchaseCompleted) void refs.current.onPurchaseCompleted(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on('broadcast', { event: RT_EVENT.paymentFailed }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onPaymentFailed) void refs.current.onPaymentFailed(p);
      })
      .on('broadcast', { event: RT_EVENT.paymentRecovered }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onPaymentRecovered) void refs.current.onPaymentRecovered(p);
      })
      .on('broadcast', { event: RT_EVENT.bidPlaced }, ({ payload }) => {
        const p = (payload as RoomBroadcastPayload | null) ?? {};
        if (refs.current.onBidPlaced) void refs.current.onBidPlaced(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on('broadcast', { event: RT_EVENT.queueItems }, () => void refs.current.onQueueItemsChange?.())
      .on('broadcast', { event: RT_EVENT.giveawaysChanged }, () => void refs.current.onGiveawaysChange?.())
      .on('broadcast', { event: RT_EVENT.vaultRevealSpin }, ({ payload }) => {
        const p = (payload as Record<string, unknown> | null) ?? {};
        void refs.current.onVaultRevealSpin?.(p);
      })
      .on('broadcast', { event: RT_EVENT.variantPurchased }, () => void refs.current.onQueueItemsChange?.())
      .on('broadcast', { event: RT_EVENT.breakSpots }, () => void refs.current.onBreakSpotsChange?.())
      .on('broadcast', { event: RT_EVENT.listingBid }, ({ payload }) => {
        const listingId = (payload as { listingId?: string } | null)?.listingId;
        if (typeof listingId === 'string') void refs.current.onListingBid?.(listingId);
      })
      .on('broadcast', { event: RT_EVENT.teamBoard }, () => void refs.current.onTeamBoardChange?.());

    const streamEvents = [RT_EVENT.streamStatus, ...(RT_EVENT_ALIASES.streamStatus ?? [])];
    for (const eventName of streamEvents) {
      channel.on('broadcast', { event: eventName }, ({ payload }) => {
        void refs.current.onStreamStatusChange?.((payload as RoomBroadcastPayload | null) ?? {});
      });
    }

    let reconnectCount = 0;
    void channel.subscribe((status) => {
      refs.current.onConnectionStateChange?.({ status, reconnectCount });
      if (status === 'SUBSCRIBED') {
        void refs.current.onMessagesRefreshMerge?.();
        reconnectCount += 1;
        if (reconnectCount > 1) void refs.current.onReconnect?.();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [opts.enabled, opts.liveRoomId]);
}
