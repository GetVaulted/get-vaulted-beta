"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LiveAuctionRoom } from "@/components/live-auction/LiveAuctionRoom";
import { LiveSaleRoom } from "@/components/live-auction/LiveSaleRoom";
import { useRealtimeRoomPresence } from "@/hooks/useRealtimeRoomPresence";
import { useRealtimeRoomSubscription } from "@/hooks/useRealtimeRoomSubscription";
import { useLiveRoomModerationState } from "@/hooks/useLiveRoomModerationState";
import { logLiveDebugEvent } from "@/lib/live-debug";
import { announceLiveRoomJoin, announceLiveRoomLeave, buildOptimisticViewerJoinMessage } from "@/lib/live-room-viewer-event-client";
import { liveRoomChatOpen } from "@/lib/live-room-chat-policy";
import { appendLiveRoomMessageDedupe, mergeLiveRoomMessagesById } from "@/lib/realtime-merge-messages";
import type { LiveRoomDetailDTO, LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { mergeLiveRoomDetailFromFetch } from "@/lib/live-room-fetch-merge";
import {
  mergeLiveRoomItemsForActiveItemEvent,
  mergeLiveRoomItemsForBidPlaced,
} from "@/lib/live-room-realtime-merge";
import { estimateClockSkewMs } from "@/lib/server-clock-sync";
import { liveChatFallbackPollMs, liveRoomReconcilePollMs } from "@/lib/live-fallback-poll-intervals";
import { parsePurchaseCompletedCelebration, type LiveAuctionCloseCelebration } from "@/lib/live-auction-winner-display";
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  spotCelebrationDismissKey,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration as LiveSpotTakenCelebrationPayload,
} from "@/lib/live-spot-celebration";
import { LiveAuctionSoldCelebration } from "@/components/live-auction/LiveAuctionSoldCelebration";
import { LiveSpotTakenCelebration } from "@/components/live-auction/LiveSpotTakenCelebration";
import { mergeVariantPurchasedIntoItems, type VariantPurchasedMergePayload } from "@/lib/live-room-variant-merge";
import { LivePaymentFailureBlocker } from "@/components/live-auction/LivePaymentFailureBlocker";
import { LivePremiumWalletSheet } from "@/components/live-auction/LivePremiumWalletSheet";
import { LiveOpenInAppBanner } from "@/components/live-auction/LiveOpenInAppBanner";
import { VaultRevealOverlay } from "@/components/live-auction/VaultRevealOverlay";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import { isLiveRoomBroadcastOnAir, type LiveRoomBroadcastGate } from "@/lib/live-room-broadcast-on-air";
import {
  LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR,
  LIVE_STREAM_PAUSED_COMMERCE_ERROR,
} from "@/lib/live-room-commerce-messages";
import { parseBuyerSafeStreamPayload } from "@/lib/live-stream-playback";

type LiveRoomShellProps = {
  roomId: string;
};

export function LiveRoomShell({ roomId }: LiveRoomShellProps) {
  const { data: session, status } = useSession();
  const moderation = useLiveRoomModerationState(roomId, Boolean(roomId));
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LiveRoomDetailDTO | null>(null);
  /** Set when the room snapshot API returns an error (404, 503, etc.) so viewers see a real message instead of a bare “not found”. */
  const [roomFetchError, setRoomFetchError] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveRoomMessageDTO[]>([]);
  const [teamBoardTick, setTeamBoardTick] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [streamPlaybackRefreshNonce, setStreamPlaybackRefreshNonce] = useState(0);
  const [broadcastGate, setBroadcastGate] = useState<LiveRoomBroadcastGate>({
    status: "scheduled",
    streamHealth: "offline",
    streamPaused: false,
  });
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
  const activeItemIdRef = useRef<string | null>(null);
  const [soldCelebration, setSoldCelebration] = useState<LiveAuctionCloseCelebration | null>(null);
  const [spotCelebration, setSpotCelebration] = useState<LiveSpotTakenCelebrationPayload | null>(null);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const [premiumWalletOpen, setPremiumWalletOpen] = useState(false);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const seenSpotCelebrationKeysRef = useRef<Set<string>>(new Set());
  /** Sticky last known count — must stay above loading/null early returns (React hooks rules). */
  const stickyViewerCountRef = useRef<number | null>(null);

  const showSpotCelebration = useCallback((taken: LiveSpotTakenCelebrationPayload) => {
    const key = spotCelebrationDismissKey(taken);
    if (seenSpotCelebrationKeysRef.current.has(key)) return;
    seenSpotCelebrationKeysRef.current.add(key);
    setSpotCelebration(taken);
    window.setTimeout(() => {
      seenSpotCelebrationKeysRef.current.delete(key);
    }, SPOT_CELEBRATION_DISPLAY_MS + 1000);
  }, []);

  const clearSpotCelebration = useCallback(() => setSpotCelebration(null), []);
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
      return appendLiveRoomMessageDedupe(prev, next);
    });
  }, [roomId]);

  // Saved / scheduled / ended shows are not live rooms — do not mount presence (or crash the page
  // trying to attach presence callbacks on a channel already subscribed for moderation/chat).
  const presenceCount = useRealtimeRoomPresence({
    liveRoomId: roomId,
    enabled: Boolean(roomId) && detail?.status === "live",
    userId: session?.user?.id ?? null,
    viewerDisplayName: session?.user?.username?.trim() ? session.user.username : null,
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

  useEffect(() => {
    activeItemIdRef.current = detail?.activeItem?.id ?? null;
  }, [detail?.activeItem?.id]);

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
          if (seq <= last) return false;
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
        // Lean bid ACK only carries auction fields — patch onto the existing row so variants/title stay intact.
        const items = prev.items.map((it) => {
          if (it.id !== item.id) return it;
          return {
            ...it,
            currentBidUsd:
              typeof item.currentBidUsd === "number" && Number.isFinite(item.currentBidUsd)
                ? item.currentBidUsd
                : it.currentBidUsd,
            startingBidUsd: item.startingBidUsd !== undefined ? item.startingBidUsd : it.startingBidUsd,
            lastHighBidderId:
              item.lastHighBidderId !== undefined ? item.lastHighBidderId : it.lastHighBidderId,
            lastHighBidderUsername:
              item.lastHighBidderUsername !== undefined
                ? item.lastHighBidderUsername
                : it.lastHighBidderUsername,
            auctionEndsAt: item.auctionEndsAt !== undefined ? item.auctionEndsAt : it.auctionEndsAt,
            biddingOpen: typeof item.biddingOpen === "boolean" ? item.biddingOpen : it.biddingOpen,
            clutchTimeEnabled:
              typeof item.clutchTimeEnabled === "boolean" ? item.clutchTimeEnabled : it.clutchTimeEnabled,
            itemVersion:
              typeof item.itemVersion === "number" && Number.isFinite(item.itemVersion)
                ? Math.max(it.itemVersion, Math.floor(item.itemVersion))
                : it.itemVersion,
          };
        });
        const activeItem = items.find((it) => it.status === "active") ?? null;
        return { ...prev, roomVersion, auctionEventSeq, items, activeItem };
      });
    },
    [refreshSkewFromRealtimePayload],
  );

  const applyVariantPurchase = useCallback((payload: VariantPurchasedMergePayload) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const items = mergeVariantPurchasedIntoItems(prev.items, payload);
      const activeItem =
        prev.activeItem?.id === payload.itemId
          ? items.find((it) => it.id === payload.itemId) ?? prev.activeItem
          : prev.activeItem;
      return { ...prev, items, activeItem };
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, {
        cache: "no-store",
        credentials: "include",
      });
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

  const handleBuyerVariantPurchased = useCallback(
    (payload: VariantPurchasedMergePayload & { label?: string; amountUsd?: number }) => {
      applyVariantPurchase(payload);
      const username = session?.user?.username ?? session?.user?.name ?? "";
      if (username.trim() && payload.label?.trim()) {
        setSpotCelebration({
          username: username.trim().replace(/^@+/, ""),
          label: payload.label.trim(),
          amountUsd: typeof payload.amountUsd === "number" && Number.isFinite(payload.amountUsd) ? payload.amountUsd : 0,
          kind: "purchase",
        });
      }
      void load();
    },
    [applyVariantPurchase, load, session?.user?.name, session?.user?.username],
  );

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

  const authEpochRef = useRef<string | null>(null);
  useEffect(() => {
    const epoch = status === "authenticated" ? session?.user?.id ?? "auth" : status;
    if (authEpochRef.current !== null && authEpochRef.current !== epoch) {
      void load();
    }
    authEpochRef.current = epoch;
  }, [load, session?.user?.id, status]);

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
    /** Realtime is primary; HTTP reconcile catches missed frames without hammering Netlify. */
    const fallbackMs = liveRoomReconcilePollMs({ hasRealtime, wantsTightPoll: wantsTightRoomPoll });
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
    const pollMs = liveChatFallbackPollMs(hasRealtime);
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

  useEffect(() => {
    if (!detail || detail.status !== "live") {
      setBroadcastGate({
        status: detail?.status ?? "scheduled",
        streamHealth: "offline",
        streamPaused: false,
      });
      return;
    }
    let cancelled = false;
    void fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/stream`)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (cancelled || !raw) return;
        const stream = parseBuyerSafeStreamPayload((raw as { stream?: unknown }).stream);
        if (!stream) return;
        setBroadcastGate({
          status: "live",
          streamHealth: stream.streamHealth,
          streamPaused: stream.streamPaused,
          streamMode: stream.streamMode,
          streamStartedAt: stream.streamStartedAt,
          streamEndedAt: stream.streamEndedAt,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail?.status, roomId, streamPlaybackRefreshNonce]);

  /** Announce join as soon as auth is ready — do not wait for the full room snapshot. */
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id || !roomId) return;
    const username = session.user.username?.trim() || "You";
    const pendingId = `pending:join:${roomId}`;
    setMessages((prev) =>
      appendLiveRoomMessageDedupe(prev, buildOptimisticViewerJoinMessage({ roomId, userId: session.user.id, username })),
    );
    void announceLiveRoomJoin(roomId).then((message) => {
      setMessages((prev) => {
        const stripped = prev.filter((m) => m.id !== pendingId);
        if (!message) return stripped;
        return appendLiveRoomMessageDedupe(stripped, message);
      });
    });
  }, [roomId, session?.user?.id, status]);

  /** Pause open-entry giveaway rows when navigating away from the room. */
  useEffect(() => {
    return () => {
      if (!session?.user?.id) return;
      announceLiveRoomLeave(roomId);
    };
  }, [roomId, session?.user?.id]);

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
    includeStaffChat: moderation.canModerate,
    onLiveRoomMessage: (m) => {
      if (m.messageType === "staff" && !moderation.canModerate) return;
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: m.messageType === "staff" ? "staff_chat_message" : "chat_message" },
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
      if (taken) showSpotCelebration(taken);
      const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
      const variantId = typeof payload.variantId === "string" ? payload.variantId : null;
      if (itemId && variantId) {
        setDetail((prev) => {
          if (!prev) return prev;
          const items = mergeVariantPurchasedIntoItems(prev.items, {
            itemId,
            variantId,
            itemVersion: typeof payload.itemVersion === "number" ? payload.itemVersion : undefined,
            quantity: typeof payload.quantity === "number" ? payload.quantity : undefined,
          });
          return { ...prev, items, activeItem: prev.activeItem?.id === itemId ? items.find((it) => it.id === itemId) ?? prev.activeItem : prev.activeItem };
        });
      }
      void load();
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
      const lotChanged = activeItemIdRef.current !== payload.itemId;
      setDetail((prev) => {
        if (!prev) return prev;
        const items = mergeLiveRoomItemsForActiveItemEvent(prev.items, payload);
        const activeItem = items.find((it) => it.status === "active") ?? null;
        const roomVersion = typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion;
        return { ...prev, roomVersion, items, activeItem };
      });
      refreshSkewFromRealtimePayload(payload.serverNowMs);
      if (lotChanged) {
        setRefreshNonce((n) => n + 1);
      } else {
        scheduleFallbackRefresh("active_item_changed", 40);
      }
    },
    onAuctionStarted: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "auction_started" },
      });
      if (!shouldProcessRealtimePayload("auction_started", payload)) return;
      refreshSkewFromRealtimePayload(payload.serverNowMs);
      setDetail((prev) => {
        const wasLive = prev?.status === "live";
        if (wasLive) {
          scheduleFallbackRefresh("auction_started", 80);
          return prev
            ? {
                ...prev,
                roomVersion:
                  typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion,
              }
            : prev;
        }
        setStreamPlaybackRefreshNonce((n) => n + 1);
        scheduleFallbackRefresh("auction_started", 80);
        return prev
          ? {
              ...prev,
              status: "live",
              startedAt: prev.startedAt ?? new Date().toISOString(),
              endedAt: null,
              roomVersion:
                typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion,
            }
          : prev;
      });
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
      const celebration = parsePurchaseCompletedCelebration(payload, session?.user?.id);
      if (celebration?.kind === "sold") setSoldCelebration(celebration);
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
          const noBids = payload.noBids === true;
          const itemSoldOut = payload.itemSoldOut !== false;
          const items = prev.items.map((it) => {
            if (it.id !== payload.itemId) return it;
            const itemVersion =
              typeof payload.itemVersion === "number" ? Math.max(it.itemVersion, payload.itemVersion) : it.itemVersion;
            if (noBids) {
              if (payload.itemSoldOut === false) {
                return {
                  ...it,
                  status: "active" as LiveRoomItemDTO["status"],
                  biddingOpen: false,
                  auctionEndsAt: null,
                  currentBidUsd: null,
                  lastHighBidderId: null,
                  lastHighBidderUsername: null,
                  itemVersion,
                };
              }
              return {
                ...it,
                status: "skipped" as LiveRoomItemDTO["status"],
                biddingOpen: false,
                auctionEndsAt: null,
                itemVersion,
              };
            }
            if (!itemSoldOut) {
              return {
                ...it,
                status: "active" as LiveRoomItemDTO["status"],
                biddingOpen: false,
                auctionEndsAt: null,
                currentBidUsd: null,
                lastHighBidderId: null,
                lastHighBidderUsername: null,
                itemVersion,
              };
            }
            return { ...it, status: "sold" as LiveRoomItemDTO["status"], biddingOpen: false, auctionEndsAt: null, itemVersion };
          });
          const roomVersion =
            typeof payload.roomVersion === "number" ? Math.max(prev.roomVersion, payload.roomVersion) : prev.roomVersion;
          const clearActive = prev.activeItem?.id === payload.itemId && itemSoldOut;
          const keepActive =
            prev.activeItem?.id === payload.itemId && !itemSoldOut
              ? items.find((it) => it.id === payload.itemId) ?? prev.activeItem
              : prev.activeItem;
          return {
            ...prev,
            roomVersion,
            items,
            activeItem: clearActive ? null : keepActive,
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
    onStreamStatusChange: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "stream_status" },
      });
      if (payload.streamHealth) {
        setBroadcastGate((prev) => ({
          ...prev,
          status: "live",
          streamHealth: payload.streamHealth!,
        }));
      }
      setStreamPlaybackRefreshNonce((n) => n + 1);
      scheduleFallbackRefresh("stream_status", 200);
    },
    onReconnect: () => {
      reconnectCountRef.current += 1;
      logLiveDebugEvent({
        event: "realtime_reconnect",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { reconnectCount: reconnectCountRef.current },
      });
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
      <>
        <LiveOpenInAppBanner roomId={roomId} />
      <div className="fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col bg-black md:top-[var(--site-header-offset)]">
        <div className="relative h-[100dvh] min-h-[100dvh] w-full md:h-[min(100dvh,calc(100vw*16/9))] md:min-h-0 md:max-h-[calc(100dvh-var(--site-header-offset,0px))] md:rounded-2xl md:border md:border-zinc-800">
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
      </>
    );
  }

  if (detail === null) {
    return (
      <>
        <LiveOpenInAppBanner roomId={roomId} />
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
      </>
    );
  }

  const host = `@${detail.sellerUsername}`;
  const isLive = detail.status === "live";
  const broadcastCommerceBlocked =
    isLive &&
    !isLiveRoomBroadcastOnAir({
      status: "live",
      streamHealth: broadcastGate.streamHealth,
      streamPaused: broadcastGate.streamPaused,
      streamMode: broadcastGate.streamMode,
      streamStartedAt: broadcastGate.streamStartedAt,
      streamEndedAt: broadcastGate.streamEndedAt,
    });
  const broadcastCommerceHint = broadcastCommerceBlocked
    ? broadcastGate.streamPaused
      ? LIVE_STREAM_PAUSED_COMMERCE_ERROR
      : LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR
    : null;
  // Sticky last known count — avoid flashing 0 while presence/broadcast reconnects.
  if (presenceCount != null) stickyViewerCountRef.current = presenceCount;
  const viewerCount = presenceCount ?? stickyViewerCountRef.current ?? 0;
  const paymentFailure = detail.buyerUnresolvedPaymentFailure ?? null;
  const isHostViewer = session?.user?.id === detail.sellerId;
  const buyerPaymentRecoveryPending = Boolean(paymentFailure && session?.user?.id && !isHostViewer);

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
        <LiveOpenInAppBanner roomId={roomId} />
        <LiveAuctionRoom
          breakId={detail.id}
          roomTitle={detail.title}
          roomCategory={detail.category}
          discoveryVisibility={detail.discoveryVisibility}
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
          teaserVideoUrl={detail.teaserVideoUrl}
          clockSkewMs={clockSkewMs}
          buyerLiveBidPaymentReady={detail.buyerLiveBidPaymentReady}
          buyerLiveShippingReady={detail.buyerLiveShippingReady}
          giveaways={detail.giveaways ?? []}
          onOpenWallet={() => setPremiumWalletOpen(true)}
          onApplyVariantPurchase={handleBuyerVariantPurchased}
          buyerPaymentRecoveryPending={buyerPaymentRecoveryPending}
          broadcastCommerceBlocked={broadcastCommerceBlocked}
          broadcastCommerceHint={broadcastCommerceHint}
        />
        <LiveAuctionSoldCelebration celebration={soldCelebration} onDone={() => setSoldCelebration(null)} />
        <LiveSpotTakenCelebration
          celebration={spotCelebration}
          onDone={clearSpotCelebration}
          viewerUsername={session?.user?.username}
        />
        <VaultRevealOverlay
          spin={vaultRevealSpin}
          onDismiss={() => setVaultRevealSpin(null)}
          viewerUsername={session?.user?.username}
          viewerUserId={session?.user?.id}
        />
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
      <LiveOpenInAppBanner roomId={roomId} />
      <LiveSaleRoom
      roomId={detail.id}
      roomTitle={detail.title}
      roomCategory={detail.category}
      discoveryVisibility={detail.discoveryVisibility}
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
      teaserVideoUrl={detail.teaserVideoUrl}
      clockSkewMs={clockSkewMs}
      buyerLiveBidPaymentReady={detail.buyerLiveBidPaymentReady}
      buyerLiveShippingReady={detail.buyerLiveShippingReady}
      giveaways={detail.giveaways ?? []}
      onOpenWallet={() => setPremiumWalletOpen(true)}
      onApplyVariantPurchase={handleBuyerVariantPurchased}
      buyerPaymentRecoveryPending={buyerPaymentRecoveryPending}
      broadcastCommerceBlocked={broadcastCommerceBlocked}
      broadcastCommerceHint={broadcastCommerceHint}
    />
      <LiveAuctionSoldCelebration celebration={soldCelebration} onDone={() => setSoldCelebration(null)} />
      <LiveSpotTakenCelebration
        celebration={spotCelebration}
        onDone={clearSpotCelebration}
        viewerUsername={session?.user?.username}
      />
      <VaultRevealOverlay
        spin={vaultRevealSpin}
        onDismiss={() => setVaultRevealSpin(null)}
        viewerUsername={session?.user?.username}
        viewerUserId={session?.user?.id}
      />
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
