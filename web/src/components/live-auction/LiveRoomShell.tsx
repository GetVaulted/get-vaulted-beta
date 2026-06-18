"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LiveAuctionRoom } from "@/components/live-auction/LiveAuctionRoom";
import { LiveSaleRoom } from "@/components/live-auction/LiveSaleRoom";
import { useRealtimeRoomPresence } from "@/hooks/useRealtimeRoomPresence";
import { useRealtimeRoomSubscription } from "@/hooks/useRealtimeRoomSubscription";
import { logLiveDebugEvent } from "@/lib/live-debug";
import { announceLiveRoomJoin } from "@/lib/live-room-viewer-event-client";
import { liveRoomChatOpen } from "@/lib/live-room-chat-policy";
import { appendLiveRoomMessageDedupe, mergeLiveRoomMessagesById } from "@/lib/realtime-merge-messages";
import type { LiveRoomDetailDTO, LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { mergeLiveRoomDetailFromFetch } from "@/lib/live-room-fetch-merge";
import {
  mergeLiveRoomItemsForActiveItemEvent,
  mergeLiveRoomItemsForBidPlaced,
} from "@/lib/live-room-realtime-merge";
import { estimateClockSkewMs } from "@/lib/server-clock-sync";
import { parsePurchaseCompletedCelebration, type LiveAuctionCloseCelebration } from "@/lib/live-auction-winner-display";
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  type LiveSpotTakenCelebration as LiveSpotTakenCelebrationPayload,
} from "@/lib/live-spot-celebration";
import { LiveAuctionSoldCelebration } from "@/components/live-auction/LiveAuctionSoldCelebration";
import { LiveSpotTakenCelebration } from "@/components/live-auction/LiveSpotTakenCelebration";
import { LivePaymentFailureBlocker } from "@/components/live-auction/LivePaymentFailureBlocker";
import { LivePremiumWalletSheet } from "@/components/live-auction/LivePremiumWalletSheet";
import { VaultRevealWheelOverlay } from "@/components/live-auction/VaultRevealWheelOverlay";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import type { LiveRoomStatus } from "@/generated/prisma/client";

type LiveRoomShellProps = {
  roomId: string;
};

export function LiveRoomShell({ roomId }: LiveRoomShellProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LiveRoomDetailDTO | null>(null);
  /** Set when the room snapshot API returns an error (404, 503, etc.) so viewers see a real message instead of a bare “not found”. */
  const [roomFetchError, setRoomFetchError] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveRoomMessageDTO[]>([]);
  const [teamBoardTick, setTeamBoardTick] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [streamPlaybackRefreshNonce, setStreamPlaybackRefreshNonce] = useState(0);
  /** Estimated server − client wall clock (ms). Updated on each room fetch + periodic `/api/time` ping while live. */
  const [clockSkewMs, setClockSkewMs] = useState(0);
  const lastRefreshAtRef = useRef<number | null>(null);
  const fallbackRefreshTimerRef = useRef<number | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastEventAtByTypeRef = useRef<Record<string, number>>({});
  const reconnectCountRef = useRef(0);
  const eventTimingRef = useRef<{ totalMs: number; count: number }>({ totalMs: 0, count: 0 });
  const lastRoomVersionRef = useRef(0);
  const lastItemVersionRef = useRef<Record<string, number>>({});
  /** Monotonic `auctionSeq` from bid HTTP ACK + `bid_placed` realtime (canonical ordering). */
  const lastAuctionSeqRef = useRef(0);
  const prevRoomLifecycleRef = useRef<LiveRoomStatus | null>(null);
  const [soldCelebration, setSoldCelebration] = useState<LiveAuctionCloseCelebration | null>(null);
  const [spotCelebration, setSpotCelebration] = useState<LiveSpotTakenCelebrationPayload | null>(null);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const [premiumWalletOpen, setPremiumWalletOpen] = useState(false);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const appendSystemMessage = useCallback((body: string, chatLabel = "System") => {
    setMessages((prev) => {
      const next: LiveRoomMessageDTO = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        liveRoomId: roomId,
        senderId: "system",
        senderUsername: chatLabel,
        senderAvatarUrl: null,
        body,
        messageType: "system",
        createdAt: new Date().toISOString(),
        mentions: [],
      };
      return [...prev.slice(-199), next];
    });
  }, [roomId]);

  const presenceCount = useRealtimeRoomPresence({
    liveRoomId: roomId,
    enabled: Boolean(roomId),
    userId: session?.user?.id ?? null,
    viewerDisplayName: session?.user?.username?.trim() ? session.user.username : null,
    onViewerEvent: () => {
      void announceLiveRoomJoin(roomId);
    },
    onPresenceStateChange: ({ status, reconnectCount }) => {
      if (reconnectCount > reconnectCountRef.current) reconnectCountRef.current = reconnectCount;
      logLiveDebugEvent({
        event: "presence_state",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { status, reconnectCount },
      });
    },
  });

  /** Latest room id for rejecting stale async `load()` responses after navigation. */
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const scheduleFallbackRefresh = useCallback(
    (reason: string, delayMs = 700) => {
      if (fallbackRefreshTimerRef.current != null) {
        window.clearTimeout(fallbackRefreshTimerRef.current);
      }
      fallbackRefreshTimerRef.current = window.setTimeout(() => {
        logLiveDebugEvent({
          event: "fallback_room_refresh",
          roomId,
          lastRefreshAtMs: lastRefreshAtRef.current,
          extra: { reason, delayMs },
        });
        setRefreshNonce((n) => n + 1);
        fallbackRefreshTimerRef.current = null;
      }, delayMs);
    },
    [roomId],
  );

  const shouldProcessRealtimePayload = useCallback(
    (type: string, payload: Record<string, unknown> | null | undefined): boolean => {
      if (!payload) return true;
      if (type === "bid_placed") {
        const seqRaw = payload.auctionSeq;
        const seq =
          typeof seqRaw === "number" && Number.isFinite(seqRaw) ? Math.floor(seqRaw) : null;
        if (seq != null) {
          const last = lastAuctionSeqRef.current;
          if (seq < last) return false;
          if (seq > last + 1) scheduleFallbackRefresh("bid_placed_auction_seq_gap", 90);
          if (seq > last) lastAuctionSeqRef.current = seq;
        }
      }
      const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
      if (eventId) {
        if (seenEventIdsRef.current.has(eventId)) return false;
        seenEventIdsRef.current.add(eventId);
        if (seenEventIdsRef.current.size > 500) {
          const next = Array.from(seenEventIdsRef.current).slice(-250);
          seenEventIdsRef.current = new Set(next);
        }
      }
      const emittedAtValue = typeof payload.emittedAt === "string" ? payload.emittedAt : null;
      const emittedAtMs =
        typeof emittedAtValue === "string" && !Number.isNaN(Date.parse(emittedAtValue))
          ? Date.parse(emittedAtValue)
          : null;
      if (emittedAtMs != null) {
        const last = lastEventAtByTypeRef.current[type] ?? 0;
        if (emittedAtMs < last) return false;
        lastEventAtByTypeRef.current[type] = emittedAtMs;
      }
      const roomVersion = typeof payload.roomVersion === "number" ? payload.roomVersion : null;
      if (roomVersion != null) {
        const last = lastRoomVersionRef.current;
        if (roomVersion < last) return false;
        if (roomVersion > last + 1) scheduleFallbackRefresh(`${type}_room_version_gap`, 80);
        lastRoomVersionRef.current = Math.max(last, roomVersion);
      }
      const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
      const itemVersion = typeof payload.itemVersion === "number" ? payload.itemVersion : null;
      if (itemId && itemVersion != null) {
        const last = lastItemVersionRef.current[itemId] ?? 0;
        if (itemVersion < last) return false;
        if (itemVersion > last + 1) scheduleFallbackRefresh(`${type}_item_version_gap`, 80);
        lastItemVersionRef.current[itemId] = Math.max(last, itemVersion);
      }
      return true;
    },
    [scheduleFallbackRefresh],
  );

  const refreshSkewFromRealtimePayload = useCallback((serverNowMs: unknown) => {
    if (typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs)) return;
    /** Same tick as `setDetail` merges — avoids one render where `auctionEndsAt` is server-future but skew is stale (bid button flicker). */
    const t = Date.now();
    setClockSkewMs(estimateClockSkewMs(t, t, serverNowMs));
  }, []);

  const mergeAuctionHttpAck = useCallback(
    (ack: {
      serverNowMs?: number;
      roomVersion?: number;
      auctionSeq?: number;
      item?: LiveRoomItemDTO | null | undefined;
    }) => {
      refreshSkewFromRealtimePayload(ack.serverNowMs);
      if (typeof ack.auctionSeq === "number" && Number.isFinite(ack.auctionSeq)) {
        lastAuctionSeqRef.current = Math.max(lastAuctionSeqRef.current, Math.floor(ack.auctionSeq));
      }
      const item = ack.item;
      if (!item || typeof item.id !== "string") return;
      if (typeof ack.roomVersion === "number") {
        lastRoomVersionRef.current = Math.max(lastRoomVersionRef.current, ack.roomVersion);
      }
      lastItemVersionRef.current[item.id] = Math.max(lastItemVersionRef.current[item.id] ?? 0, item.itemVersion ?? 0);
      setDetail((prev) => {
        if (!prev) return prev;
        const roomVersion =
          typeof ack.roomVersion === "number" ? Math.max(prev.roomVersion, ack.roomVersion) : prev.roomVersion;
        const auctionEventSeq =
          typeof ack.auctionSeq === "number" && Number.isFinite(ack.auctionSeq)
            ? Math.max(prev.auctionEventSeq ?? 0, Math.floor(ack.auctionSeq))
            : prev.auctionEventSeq;
        const items = prev.items.map((it) => (it.id === item.id ? item : it));
        const activeItem = items.find((it) => it.status === "active") ?? null;
        return { ...prev, roomVersion, auctionEventSeq, items, activeItem };
      });
    },
    [refreshSkewFromRealtimePayload],
  );

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const t1 = Date.now();
      if (res.status === 404) {
        const raw = await res.text();
        let apiMsg = "Not found";
        try {
          const j = JSON.parse(raw) as { error?: string };
          if (typeof j.error === "string" && j.error.trim()) apiMsg = j.error.trim();
        } catch {
          /* ignore */
        }
        if (roomIdRef.current === roomId) {
          lastAuctionSeqRef.current = 0;
          setDetail(null);
          setRoomFetchError(
            apiMsg === "Not found"
              ? "Room not found or not visible. Check the URL, sign in if this is your show, or confirm you are on the correct database (DATABASE_URL)."
              : apiMsg,
          );
          setLoading(false);
        }
        return;
      }
      if (!res.ok) {
        const raw = await res.text();
        let apiMsg = `Could not load this room (HTTP ${res.status}).`;
        try {
          const j = JSON.parse(raw) as { error?: string; code?: string };
          if (typeof j.error === "string" && j.error.trim()) apiMsg = j.error.trim();
          if (j.code === "LIVE_COMING_SOON") {
            apiMsg = "Live marketplace is not available in this environment yet.";
          }
        } catch {
          /* ignore */
        }
        if (roomIdRef.current === roomId) {
          setRoomFetchError(apiMsg);
          setLoading(false);
        }
        return;
      }
      const j = (await res.json()) as { room?: LiveRoomDetailDTO; serverNowMs?: number };
      if (roomIdRef.current === roomId) setRoomFetchError(null);
      if (typeof j.serverNowMs === "number") {
        setClockSkewMs(estimateClockSkewMs(t0, t1, j.serverNowMs));
      }
      if (j.room && j.room.id === roomIdRef.current) {
        const mergedHolder: { current: LiveRoomDetailDTO | null } = { current: null };
        setDetail((prev) => {
          const next = !prev || prev.id !== j.room!.id ? j.room! : mergeLiveRoomDetailFromFetch(prev, j.room!);
          mergedHolder.current = next;
          return next;
        });
        const mergedOut = mergedHolder.current;
        if (mergedOut && mergedOut.id === roomIdRef.current) {
          const incoming = mergedOut.messages ?? [];
          setMessages((prev) => mergeLiveRoomMessagesById(prev, incoming));
          lastRefreshAtRef.current = Date.now();
          seenEventIdsRef.current.clear();
          lastEventAtByTypeRef.current = {};
          lastRoomVersionRef.current = mergedOut.roomVersion ?? 0;
          lastItemVersionRef.current = Object.fromEntries(
            (mergedOut.items ?? []).map((it) => [it.id, it.itemVersion ?? 0]),
          );
          lastAuctionSeqRef.current = Math.max(lastAuctionSeqRef.current, mergedOut.auctionEventSeq ?? 0);
        }
      }
      if (!j.room && roomIdRef.current === roomId) {
        setRoomFetchError("Server returned an empty room payload. Try refreshing.");
        setDetail(null);
      }
      if (roomIdRef.current === roomId) setLoading(false);
    } catch {
      if (roomIdRef.current === roomId) {
        setRoomFetchError("Network error while loading the room. Check your connection and try again.");
        setLoading(false);
      }
    }
  }, [roomId]);

  /** Full GET snapshot when queue/break/listing events fire — covers missed typed payloads (host Start, claims, etc.). */
  const roomSnapshotFlushRef = useRef<number | null>(null);
  const requestRoomSnapshotSync = useCallback(() => {
    if (roomSnapshotFlushRef.current != null) return;
    roomSnapshotFlushRef.current = window.requestAnimationFrame(() => {
      roomSnapshotFlushRef.current = null;
      void load();
    });
  }, [load]);

  /** Coalesce `queue_items` → GET so it does not race `active_item_changed` + replica lag on host Start. */
  const queueSnapshotDebounceRef = useRef<number | null>(null);
  const requestQueueSnapshotSyncDebounced = useCallback(() => {
    if (queueSnapshotDebounceRef.current != null) window.clearTimeout(queueSnapshotDebounceRef.current);
    queueSnapshotDebounceRef.current = window.setTimeout(() => {
      queueSnapshotDebounceRef.current = null;
      void load();
    }, 100);
  }, [load]);

  useEffect(() => {
    return () => {
      if (roomSnapshotFlushRef.current != null) {
        window.cancelAnimationFrame(roomSnapshotFlushRef.current);
        roomSnapshotFlushRef.current = null;
      }
      if (queueSnapshotDebounceRef.current != null) {
        window.clearTimeout(queueSnapshotDebounceRef.current);
        queueSnapshotDebounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Sync loading with room route; `load` applies detail/messages after fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional full-room refetch gate + async load()
    setLoading(true);
    setRoomFetchError(null);
    setMessages([]);
    void load();
  }, [roomId, load]);

  useEffect(() => {
    return () => {
      if (fallbackRefreshTimerRef.current != null) window.clearTimeout(fallbackRefreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    lastAuctionSeqRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    const hasRealtime = Boolean(getSupabaseBrowserClient());
    const liveStatus = detail?.status === "live";
    /** Open lot: clutch mode can omit `auctionEndsAt` while `biddingOpen` is true — still need fast snapshots. */
    const openLot =
      detail?.activeItem?.status === "active" && detail.activeItem.biddingOpen === true;
    const wantsTightRoomPoll = liveStatus || openLot;
    /** Tight while live or an active lot is taking bids so missed Supabase frames recover quickly. */
    const fallbackMs = wantsTightRoomPoll ? (hasRealtime ? 350 : 450) : hasRealtime ? 15000 : 5000;
    const id = window.setInterval(() => void load(), fallbackMs);
    return () => window.clearInterval(id);
  }, [load, detail?.status, detail?.activeItem?.id, detail?.activeItem?.status, detail?.activeItem?.biddingOpen]);

  /** Mid-session skew refresh so clock drift does not accumulate during long streams. */
  useEffect(() => {
    if (detail?.status !== "live") return;
    const tick = async () => {
      const t0 = Date.now();
      try {
        const res = await fetch("/api/time", { cache: "no-store" });
        const t1 = Date.now();
        if (!res.ok) return;
        const j = (await res.json()) as { serverNowMs?: number };
        if (typeof j.serverNowMs === "number") setClockSkewMs(estimateClockSkewMs(t0, t1, j.serverNowMs));
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 45_000);
    return () => window.clearInterval(id);
  }, [detail?.status]);

  /** Light chat poll while live so buyers stay in sync if browser Supabase is not configured (full-room poll alone can race realtime). */
  const mergeMessagesFromApi = useCallback(async () => {
    const rid = roomId;
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(rid)}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      if (roomIdRef.current !== rid) return;
      const j = (await res.json()) as { messages?: LiveRoomMessageDTO[] };
      const incoming = Array.isArray(j.messages) ? j.messages : [];
      setMessages((prev) => mergeLiveRoomMessagesById(prev, incoming));
    } catch {
      /* Failed to fetch: dev restart, tab sleep, navigation — next poll will retry */
    }
  }, [roomId]);

  /** Chat poll while the room is published (scheduled or live). */
  const chatPollActive = liveRoomChatOpen(detail?.status);
  useEffect(() => {
    if (!chatPollActive) return;
    const hasRealtime = Boolean(getSupabaseBrowserClient());
    const pollMs = hasRealtime ? 1100 : 2000;
    const id = window.setInterval(() => void mergeMessagesFromApi(), pollMs);
    return () => window.clearInterval(id);
  }, [chatPollActive, mergeMessagesFromApi]);

  useEffect(() => {
    if (refreshNonce === 0) return;
    void load();
  }, [refreshNonce, load]);

  /** Poll can mark the room live without a realtime `auction_started` — refresh playback immediately. */
  useEffect(() => {
    if (!detail) return;
    const prev = prevRoomLifecycleRef.current;
    prevRoomLifecycleRef.current = detail.status;
    if (prev && prev !== "live" && detail.status === "live") {
      setStreamPlaybackRefreshNonce((n) => n + 1);
    }
  }, [detail]);

  /** Announce join when entering a published room (scheduled or live). */
  useEffect(() => {
    if (!liveRoomChatOpen(detail?.status) || !session?.user?.id) return;
    void announceLiveRoomJoin(roomId);
  }, [detail?.status, roomId, session?.user?.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void mergeMessagesFromApi();
      scheduleFallbackRefresh("visibility_resume", 60);
    };
    const onOnline = () => {
      void mergeMessagesFromApi();
      scheduleFallbackRefresh("network_online", 60);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [scheduleFallbackRefresh, mergeMessagesFromApi]);

  useRealtimeRoomSubscription({
    /** Subscribe as soon as the route is known so broadcasts are not missed while the first room payload loads. */
    liveRoomId: roomId,
    enabled: Boolean(roomId),
    onLiveRoomMessage: (m) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "chat_message" },
      });
      const now = Date.now();
      const lastRefresh = lastRefreshAtRef.current;
      if (typeof lastRefresh === "number") {
        eventTimingRef.current.totalMs += Math.max(0, now - lastRefresh);
        eventTimingRef.current.count += 1;
        const avgMs = Math.round(eventTimingRef.current.totalMs / Math.max(1, eventTimingRef.current.count));
        logLiveDebugEvent({
          event: "event_timing_avg",
          roomId,
          lastRefreshAtMs: lastRefresh,
          extra: { samples: eventTimingRef.current.count, avgMs },
        });
      }
      setMessages((prev) => appendLiveRoomMessageDedupe(prev, m));
    },
    onMessagesRefreshMerge: mergeMessagesFromApi,
    onQueueItemsChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "queue_items" },
      });
      requestQueueSnapshotSyncDebounced();
      scheduleFallbackRefresh("queue_items", 350);
    },
    onGiveawaysChange: () => {
      scheduleFallbackRefresh("giveaways_changed", 250);
    },
    onVaultRevealSpin: (payload) => {
      const spin = parseVaultRevealSpinPayload(payload);
      if (!spin || seenVaultRevealSpinIdsRef.current.has(spin.spinId)) return;
      seenVaultRevealSpinIdsRef.current.add(spin.spinId);
      setVaultRevealSpin(spin);
      scheduleFallbackRefresh("giveaways_changed", 250);
    },
    onBreakSpotsChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "break_spots" },
      });
      setTeamBoardTick((n) => n + 1);
      requestRoomSnapshotSync();
      scheduleFallbackRefresh("break_spots", 450);
    },
    onVariantPurchased: (payload) => {
      if (!shouldProcessRealtimePayload("variant_purchased", payload)) return;
      const taken = parseVariantPurchasedCelebration(payload);
      if (taken) setSpotCelebration(taken);
      scheduleFallbackRefresh("variant_purchased", 250);
    },
    onListingBid: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "listing_bid" },
      });
      requestRoomSnapshotSync();
      scheduleFallbackRefresh("listing_bid", 450);
    },
    onTeamBoardChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "team_board" },
      });
      setTeamBoardTick((n) => n + 1);
    },
    onBidPlaced: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "bid_placed", hasItem: Boolean(payload.itemId) },
      });
      if (!shouldProcessRealtimePayload("bid_placed", payload)) {
        if (process.env.NODE_ENV === "development") {
          const seqRaw = payload?.auctionSeq;
          console.debug("[live-auction-client] bid_placed skipped", {
            seq: seqRaw,
            lastAuctionSeq: lastAuctionSeqRef.current,
          });
        }
        return;
      }
      if (process.env.NODE_ENV === "development") {
        console.debug("[live-auction-client] bid_placed applied", {
          auctionSeq: payload.auctionSeq,
          itemId: payload.itemId,
        });
      }
      if (!payload.itemId || typeof payload.amountUsd !== "number") {
        scheduleFallbackRefresh("bid_placed_missing_payload", 450);
        return;
      }
      setDetail((prev) => {
        if (!prev) return prev;
        const roomVersion = typeof payload.roomVersion === "number" ? payload.roomVersion : prev.roomVersion;
        const items = mergeLiveRoomItemsForBidPlaced(prev.items, payload);
        const auctionEventSeq =
          typeof payload.auctionSeq === "number" && Number.isFinite(payload.auctionSeq)
            ? Math.max(prev.auctionEventSeq ?? 0, Math.floor(payload.auctionSeq))
            : prev.auctionEventSeq;
        return {
          ...prev,
          roomVersion: Math.max(prev.roomVersion, roomVersion),
          auctionEventSeq,
          items,
          activeItem: items.find((it) => it.status === "active") ?? null,
        };
      });
      refreshSkewFromRealtimePayload(payload.serverNowMs);
      scheduleFallbackRefresh("bid_placed", 80);
    },
    onActiveItemChanged: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "active_item_changed", hasItem: Boolean(payload.itemId) },
      });
      if (!shouldProcessRealtimePayload("active_item_changed", payload)) return;
      if (!payload.itemId) {
        scheduleFallbackRefresh("active_item_changed_missing_item", 450);
        return;
      }
      setDetail((prev) => {
        if (!prev) return prev;
        const items = mergeLiveRoomItemsForActiveItemEvent(prev.items, payload);
        const activeItem = items.find((it) => it.status === "active") ?? null;
        const roomVersion = typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion;
        return { ...prev, roomVersion, items, activeItem };
      });
      refreshSkewFromRealtimePayload(payload.serverNowMs);
      scheduleFallbackRefresh("active_item_changed", 40);
    },
    onAuctionStarted: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "auction_started" },
      });
      if (!shouldProcessRealtimePayload("auction_started", payload)) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: "live",
              startedAt: prev.startedAt ?? new Date().toISOString(),
              endedAt: null,
              roomVersion:
                typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion,
            }
          : prev,
      );
      refreshSkewFromRealtimePayload(payload.serverNowMs);
      setStreamPlaybackRefreshNonce((n) => n + 1);
      scheduleFallbackRefresh("auction_started", 80);
    },
    onAuctionEnded: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "auction_ended" },
      });
      if (!shouldProcessRealtimePayload("auction_ended", payload)) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: "ended",
              endedAt: new Date().toISOString(),
              roomVersion:
                typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion,
            }
          : prev,
      );
      scheduleFallbackRefresh("auction_ended", 1000);
    },
    onPurchaseCompleted: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "purchase_completed", hasItem: Boolean(payload.itemId) },
      });
      if (!shouldProcessRealtimePayload("purchase_completed", payload)) return;
      const celebration = parsePurchaseCompletedCelebration(payload);
      const spotTaken =
        celebration?.kind === "sold"
          ? parseAuctionWinSpotCelebration({
              winnerUsername: celebration.winnerUsername,
              winningAmountUsd: celebration.winningAmountUsd,
              itemTitle:
                detail?.items.find((it) => it.id === celebration.itemId)?.displayTitle ??
                detail?.items.find((it) => it.id === celebration.itemId)?.title ??
                null,
              noBids: false,
            })
          : null;
      if (spotTaken) setSpotCelebration(spotTaken);
      if (celebration) setSoldCelebration(celebration);
      if (
        payload.paymentStatus === "payment_failed" &&
        payload.winnerId &&
        session?.user?.id &&
        payload.winnerId === session.user.id
      ) {
        void load();
      }
      if (payload.itemId) {
        setDetail((prev) => {
          if (!prev) return prev;
          const items = prev.items.map((it) => {
            if (it.id !== payload.itemId) return it;
            const status: LiveRoomItemDTO["status"] = "sold";
            const itemVersion =
              typeof payload.itemVersion === "number" ? Math.max(it.itemVersion, payload.itemVersion) : it.itemVersion;
            return { ...it, status, itemVersion };
          });
          const roomVersion =
            typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion;
          return {
            ...prev,
            roomVersion,
            items,
            activeItem: prev.activeItem?.id === payload.itemId ? null : prev.activeItem,
          };
        });
      }
      scheduleFallbackRefresh("purchase_completed", 900);
    },
    onPaymentFailed: (payload) => {
      if (payload.buyerId && session?.user?.id && payload.buyerId === session.user.id) {
        void load();
      }
    },
    onPaymentRecovered: (payload) => {
      if (payload.buyerId && session?.user?.id && payload.buyerId === session.user.id) {
        void load();
      }
    },
    onRoomStateEvent: () => scheduleFallbackRefresh("room_state_event", 1800),
    onStreamStatusChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "stream_status" },
      });
      setStreamPlaybackRefreshNonce((n) => n + 1);
    },
    onReconnect: () => {
      reconnectCountRef.current += 1;
      logLiveDebugEvent({
        event: "realtime_reconnect",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { reconnectCount: reconnectCountRef.current },
      });
      setStreamPlaybackRefreshNonce((n) => n + 1);
      scheduleFallbackRefresh("reconnect", 120);
    },
    onConnectionStateChange: ({ status, reconnectCount }) => {
      if (reconnectCount > reconnectCountRef.current) reconnectCountRef.current = reconnectCount;
      logLiveDebugEvent({
        event: "realtime_connection_state",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { status, reconnectCount },
      });
    },
  });

  if (loading) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col bg-black md:top-[var(--site-header-offset)]">
        <div className="relative h-[100dvh] min-h-[100dvh] w-full md:aspect-video md:h-auto md:min-h-[min(56vw,420px)] md:rounded-2xl md:border md:border-zinc-800">
          <div className="pointer-events-none absolute inset-0 animate-pulse motion-reduce:animate-none">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
            <div className="absolute inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
              <div className="h-8 w-24 rounded-full bg-white/[0.06]" />
              <div className="ml-auto h-6 w-16 rounded-full bg-white/[0.05]" />
            </div>
            <div className="absolute inset-x-3 bottom-[max(16rem,calc(env(safe-area-inset-bottom)+14.75rem))] space-y-2 md:hidden">
              <div className="h-9 w-[72%] rounded-lg bg-white/[0.05]" />
              <div className="h-7 w-[48%] rounded-lg bg-white/[0.04]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[13.5rem] rounded-t-2xl border border-white/[0.08] border-b-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-transparent md:hidden" aria-hidden />
            <div className="pointer-events-none absolute inset-x-3 bottom-[max(0.65rem,env(safe-area-inset-bottom))] h-10 rounded-xl bg-white/[0.06] md:hidden" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 to-transparent" aria-hidden />
          </div>
        </div>
        <p className="sr-only">Loading live room</p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-lg font-bold text-foreground">Could not open this live room</p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {roomFetchError ??
            "This live room does not exist or was removed. If an API request failed, check the Network tab for the `/api/live-rooms/...` response."}
        </p>
        <Link href="/live" className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
          ← Browse live rooms
        </Link>
      </div>
    );
  }

  const host = `@${detail.sellerUsername}`;
  const isLive = detail.status === "live";
  const viewerCount = presenceCount ?? 0;
  const paymentFailure = detail.buyerUnresolvedPaymentFailure ?? null;
  const isHostViewer = session?.user?.id === detail.sellerId;

  const paymentBlocker =
    paymentFailure && session?.user?.id && !isHostViewer ? (
      <LivePaymentFailureBlocker
        liveRoomId={detail.id}
        failure={paymentFailure}
        onResolved={() => void load()}
        onOpenWallet={() => setPremiumWalletOpen(true)}
      />
    ) : null;

  if (detail.roomType === "break") {
    return (
      <>
        <LiveAuctionRoom
          breakId={detail.id}
          roomTitle={detail.title}
          roomCategory={detail.category}
          sellerId={detail.sellerId}
          sellerShopUsername={detail.sellerUsername}
          hostDisplayName={host}
          viewerCount={viewerCount}
          isLive={isLive}
          roomStatus={detail.status}
          liveRoomId={detail.id}
          dbItems={detail.items}
          messages={messages}
          onMessagesChange={setMessages}
          onRefetch={load}
          onAuctionHttpAck={mergeAuctionHttpAck}
          break={detail.break}
          teamBoardTick={teamBoardTick}
          streamPlaybackRefreshNonce={streamPlaybackRefreshNonce}
          scheduledStartAt={detail.scheduledStartAt}
          thumbnailUrl={detail.thumbnailUrl}
          clockSkewMs={clockSkewMs}
          buyerLiveBidPaymentReady={detail.buyerLiveBidPaymentReady}
          buyerLiveShippingReady={detail.buyerLiveShippingReady}
          giveaways={detail.giveaways ?? []}
        />
        <LiveAuctionSoldCelebration celebration={soldCelebration} onDone={() => setSoldCelebration(null)} />
        <LiveSpotTakenCelebration celebration={spotCelebration} onDone={() => setSpotCelebration(null)} />
        <VaultRevealWheelOverlay spin={vaultRevealSpin} onDismiss={() => setVaultRevealSpin(null)} />
        {paymentBlocker}
        <LivePremiumWalletSheet
          open={premiumWalletOpen}
          onClose={() => setPremiumWalletOpen(false)}
          liveRoomId={detail.id}
          onReadinessChange={() => void load()}
        />
      </>
    );
  }

  return (
    <>
      <LiveSaleRoom
      roomId={detail.id}
      roomTitle={detail.title}
      roomCategory={detail.category}
      sellerId={detail.sellerId}
      sellerShopUsername={detail.sellerUsername}
      hostDisplayName={host}
      viewerCount={viewerCount}
      isLive={isLive}
      roomStatus={detail.status}
      roomType={detail.roomType}
      liveRoomId={detail.id}
      dbItems={detail.items}
      messages={messages}
      onMessagesChange={setMessages}
      onRefetch={load}
      onAuctionHttpAck={mergeAuctionHttpAck}
      streamPlaybackRefreshNonce={streamPlaybackRefreshNonce}
      scheduledStartAt={detail.scheduledStartAt}
      thumbnailUrl={detail.thumbnailUrl}
      clockSkewMs={clockSkewMs}
      buyerLiveBidPaymentReady={detail.buyerLiveBidPaymentReady}
      buyerLiveShippingReady={detail.buyerLiveShippingReady}
      giveaways={detail.giveaways ?? []}
    />
      <LiveAuctionSoldCelebration celebration={soldCelebration} onDone={() => setSoldCelebration(null)} />
      <LiveSpotTakenCelebration celebration={spotCelebration} onDone={() => setSpotCelebration(null)} />
      <VaultRevealWheelOverlay spin={vaultRevealSpin} onDismiss={() => setVaultRevealSpin(null)} />
      {paymentBlocker}
      <LivePremiumWalletSheet
        open={premiumWalletOpen}
        onClose={() => setPremiumWalletOpen(false)}
        liveRoomId={detail.id}
        onReadinessChange={() => void load()}
      />
    </>
  );
}
