"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { roomChannel, RT_EVENT, RT_EVENT_ALIASES } from "@/lib/realtime-channels";

export function useRealtimeRoomSubscription(opts: {
  liveRoomId: string | null;
  enabled?: boolean;
  onLiveRoomMessage: (message: LiveRoomMessageDTO) => void;
  onMessagesRefreshMerge: () => void | Promise<void>;
  /** Queue rows added/removed — refetch room detail / host console. */
  onQueueItemsChange?: () => void | Promise<void>;
  onGiveawaysChange?: () => void | Promise<void>;
  onVaultRevealSpin?: (payload: Record<string, unknown>) => void | Promise<void>;
  onTeamBreakReady?: () => void | Promise<void>;
  onTeamBreakBegan?: () => void | Promise<void>;
  onBreakSpotsChange: () => void | Promise<void>;
  onListingBid: (listingId: string) => void | Promise<void>;
  onTeamBoardChange?: () => void | Promise<void>;
  onRoomStateEvent?: () => void | Promise<void>;
  onBidPlaced?: (payload: {
    roomId?: string;
    liveRoomId?: string;
    itemId?: string;
    amountUsd?: number;
    roomVersion?: number;
    itemVersion?: number;
    auctionEndsAt?: string | null;
    biddingOpen?: boolean;
    bidderId?: string;
    leadingBidderId?: string;
    leadingBidderUsername?: string | null;
    listingId?: string | null;
    /** Monotonic per-room sequence (canonical ordering). */
    auctionSeq?: number;
    serverNowMs?: number;
    eventId?: string;
    emittedAt?: string;
  }) => void | Promise<void>;
  onActiveItemChanged?: (payload: {
    roomId?: string;
    liveRoomId?: string;
    itemId?: string;
    roomVersion?: number;
    itemVersion?: number;
    biddingOpen?: boolean;
    auctionEndsAt?: string | null;
    serverNowMs?: number;
    eventId?: string;
    emittedAt?: string;
  }) => void | Promise<void>;
  onAuctionStarted?: (payload: {
    roomId?: string;
    liveRoomId?: string;
    roomVersion?: number;
    serverNowMs?: number;
    eventId?: string;
    emittedAt?: string;
  }) => void | Promise<void>;
  onAuctionEnded?: (payload: {
    roomId?: string;
    liveRoomId?: string;
    roomVersion?: number;
    eventId?: string;
    emittedAt?: string;
  }) => void | Promise<void>;
  onPurchaseCompleted?: (payload: {
    roomId?: string;
    liveRoomId?: string;
    itemId?: string;
    roomVersion?: number;
    itemVersion?: number;
    eventId?: string;
    emittedAt?: string;
    paymentStatus?: string | null;
    winnerId?: string | null;
  }) => void | Promise<void>;
  onPaymentFailed?: (payload: {
    buyerId?: string;
    failureId?: string;
    amountUsd?: number;
    buyerUsername?: string | null;
    itemTitle?: string | null;
  }) => void | Promise<void>;
  onPaymentRecovered?: (payload: { buyerId?: string; failureId?: string; buyerUsername?: string | null }) => void | Promise<void>;
  /** IVS / `streamHealth` sync — refetch `GET /api/live-rooms/[id]/stream` (buyer-safe) or host UI. */
  onStreamStatusChange?: (payload: {
    streamHealth?: string;
    roomVersion?: number;
    lastStatusSyncAt?: string;
    eventId?: string;
    emittedAt?: string;
  }) => void | Promise<void>;
  onReconnect?: () => void | Promise<void>;
  onConnectionStateChange?: (state: { status: string; reconnectCount: number }) => void;
}): void {
  const {
    liveRoomId,
    enabled = true,
    onLiveRoomMessage,
    onMessagesRefreshMerge,
    onQueueItemsChange,
    onGiveawaysChange,
    onVaultRevealSpin,
    onTeamBreakReady,
    onTeamBreakBegan,
    onBreakSpotsChange,
    onListingBid,
    onTeamBoardChange,
    onRoomStateEvent,
    onBidPlaced,
    onActiveItemChanged,
    onAuctionStarted,
    onAuctionEnded,
    onPurchaseCompleted,
    onPaymentFailed,
    onPaymentRecovered,
    onStreamStatusChange,
    onReconnect,
    onConnectionStateChange,
  } = opts;

  const refs = useRef({
    onLiveRoomMessage,
    onMessagesRefreshMerge,
    onQueueItemsChange,
    onGiveawaysChange,
    onVaultRevealSpin,
    onTeamBreakReady,
    onTeamBreakBegan,
    onBreakSpotsChange,
    onListingBid,
    onTeamBoardChange,
    onRoomStateEvent,
    onBidPlaced,
    onActiveItemChanged,
    onAuctionStarted,
    onAuctionEnded,
    onPurchaseCompleted,
    onPaymentFailed,
    onPaymentRecovered,
    onStreamStatusChange,
    onReconnect,
    onConnectionStateChange,
  });
  useLayoutEffect(() => {
    refs.current = {
      onLiveRoomMessage,
      onMessagesRefreshMerge,
    onQueueItemsChange,
    onGiveawaysChange,
    onVaultRevealSpin,
    onTeamBreakReady,
    onTeamBreakBegan,
    onBreakSpotsChange,
    onListingBid,
      onTeamBoardChange,
      onRoomStateEvent,
      onBidPlaced,
      onActiveItemChanged,
      onAuctionStarted,
      onAuctionEnded,
      onPurchaseCompleted,
      onPaymentFailed,
      onPaymentRecovered,
      onStreamStatusChange,
      onReconnect,
      onConnectionStateChange,
    };
  }, [
    onLiveRoomMessage,
    onMessagesRefreshMerge,
    onQueueItemsChange,
    onGiveawaysChange,
    onVaultRevealSpin,
    onTeamBreakReady,
    onTeamBreakBegan,
    onBreakSpotsChange,
    onListingBid,
    onTeamBoardChange,
    onRoomStateEvent,
    onBidPlaced,
    onActiveItemChanged,
    onAuctionStarted,
    onAuctionEnded,
    onPurchaseCompleted,
    onPaymentFailed,
    onPaymentRecovered,
    onStreamStatusChange,
    onReconnect,
    onConnectionStateChange,
  ]);

  useEffect(() => {
    if (!enabled || !liveRoomId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const name = roomChannel(liveRoomId);
    const channel = supabase.channel(name);
    const chatEvents = [RT_EVENT.chatMessage, ...(RT_EVENT_ALIASES.chatMessage ?? [])];
    for (const eventName of chatEvents) {
      channel.on("broadcast", { event: eventName }, ({ payload }) => {
        const m = (payload as { message?: LiveRoomMessageDTO } | null)?.message;
        if (m && typeof m.id === "string") refs.current.onLiveRoomMessage(m);
      });
    }
    channel
      .on("broadcast", { event: RT_EVENT.messagesRefresh }, () => void refs.current.onMessagesRefreshMerge())
      /** Item/timer patches before `queueItems` so a same-tick snapshot load cannot overwrite fresh `active_item_changed` merges. */
      .on("broadcast", { event: RT_EVENT.auctionStarted }, ({ payload }) => {
        const p = (payload as { liveRoomId?: string } | null) ?? {};
        if (refs.current.onAuctionStarted) void refs.current.onAuctionStarted(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on("broadcast", { event: RT_EVENT.auctionEnded }, ({ payload }) => {
        const p = (payload as { liveRoomId?: string } | null) ?? {};
        if (refs.current.onAuctionEnded) void refs.current.onAuctionEnded(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on("broadcast", { event: RT_EVENT.activeItemChanged }, ({ payload }) => {
        const p = (payload as { liveRoomId?: string; itemId?: string } | null) ?? {};
        if (refs.current.onActiveItemChanged) void refs.current.onActiveItemChanged(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on("broadcast", { event: RT_EVENT.purchaseCompleted }, ({ payload }) => {
        const p = (payload as { liveRoomId?: string; itemId?: string; paymentStatus?: string; winnerId?: string } | null) ?? {};
        if (refs.current.onPurchaseCompleted) void refs.current.onPurchaseCompleted(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on("broadcast", { event: RT_EVENT.paymentFailed }, ({ payload }) => {
        const p = (payload as { buyerId?: string; failureId?: string } | null) ?? {};
        if (refs.current.onPaymentFailed) void refs.current.onPaymentFailed(p);
      })
      .on("broadcast", { event: RT_EVENT.paymentRecovered }, ({ payload }) => {
        const p = (payload as { buyerId?: string; failureId?: string } | null) ?? {};
        if (refs.current.onPaymentRecovered) void refs.current.onPaymentRecovered(p);
      })
      .on("broadcast", { event: RT_EVENT.bidPlaced }, ({ payload }) => {
        const p = (payload as { liveRoomId?: string; itemId?: string; amountUsd?: number } | null) ?? {};
        if (refs.current.onBidPlaced) void refs.current.onBidPlaced(p);
        else void refs.current.onRoomStateEvent?.();
      })
      .on("broadcast", { event: RT_EVENT.queueItems }, () => void refs.current.onQueueItemsChange?.())
      .on("broadcast", { event: RT_EVENT.giveawaysChanged }, () => void refs.current.onGiveawaysChange?.())
      .on("broadcast", { event: RT_EVENT.vaultRevealSpin }, ({ payload }) => {
        const p = (payload as Record<string, unknown> | null) ?? {};
        void refs.current.onVaultRevealSpin?.(p);
      })
      .on("broadcast", { event: RT_EVENT.variantPurchased }, () => void refs.current.onQueueItemsChange?.())
      .on("broadcast", { event: RT_EVENT.teamBreakReady }, () => void refs.current.onTeamBreakReady?.())
      .on("broadcast", { event: RT_EVENT.teamBreakBegan }, () => void refs.current.onTeamBreakBegan?.())
      .on("broadcast", { event: RT_EVENT.breakSpots }, () => void refs.current.onBreakSpotsChange())
      .on("broadcast", { event: RT_EVENT.listingBid }, ({ payload }) => {
        const listingId = (payload as { listingId?: string } | null)?.listingId;
        if (typeof listingId === "string") void refs.current.onListingBid(listingId);
      })
      .on("broadcast", { event: RT_EVENT.teamBoard }, () => void refs.current.onTeamBoardChange?.());

    const streamEvents = [RT_EVENT.streamStatus, ...(RT_EVENT_ALIASES.streamStatus ?? [])];
    for (const eventName of streamEvents) {
      channel.on("broadcast", { event: eventName }, ({ payload }) => {
        const p = (payload as Record<string, unknown> | null) ?? {};
        void refs.current.onStreamStatusChange?.({
          streamHealth: typeof p.streamHealth === "string" ? p.streamHealth : undefined,
          roomVersion: typeof p.roomVersion === "number" ? p.roomVersion : undefined,
          lastStatusSyncAt: typeof p.lastStatusSyncAt === "string" ? p.lastStatusSyncAt : undefined,
          eventId: typeof p.eventId === "string" ? p.eventId : undefined,
          emittedAt: typeof p.emittedAt === "string" ? p.emittedAt : undefined,
        });
      });
    }

    if (process.env.NEXT_PUBLIC_SUPABASE_ENABLE_POSTGRES_REALTIME === "true") {
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "LiveRoomMessage", filter: `liveRoomId=eq.${liveRoomId}` },
          () => void refs.current.onMessagesRefreshMerge(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "BreakSpot", filter: `liveRoomId=eq.${liveRoomId}` },
          () => void refs.current.onBreakSpotsChange(),
        );
    }

    let reconnectCount = 0;
    void channel.subscribe((status) => {
      refs.current.onConnectionStateChange?.({ status, reconnectCount });
      if (status === "SUBSCRIBED") {
        void refs.current.onMessagesRefreshMerge?.();
        reconnectCount += 1;
        if (reconnectCount > 1) void refs.current.onReconnect?.();
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [liveRoomId, enabled]);
}
