"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { TeamBoardChromeButton } from "@/components/team-board/TeamBoardChromeButton";
import { TeamBoardOverlay } from "@/components/team-board/TeamBoardOverlay";
import { LiveSellerCommandCenter } from "@/components/break-host/LiveSellerCommandCenter";
import { LiveAuctionSoldCelebration } from "@/components/live-auction/LiveAuctionSoldCelebration";
import { VaultHostAnnouncements } from "@/components/break-host/vault/VaultHostAnnouncements";
import { VaultHostLiveChatPanel } from "@/components/break-host/vault/VaultHostLiveChatPanel";
import { VaultHostStageEdgeRail } from "@/components/break-host/vault/VaultHostStageEdgeRail";
import { VaultHostRightRail } from "@/components/break-host/vault/VaultHostRightRail";
import { VaultPinnedLot } from "@/components/break-host/vault/VaultPinnedLot";
import { AddQueueItemModal, type AddQueueItemAuctionPayload, type AddQueueItemCloseReason } from "@/components/break-host/AddQueueItemModal";
import { VaultQueueDrawer } from "@/components/break-host/vault/VaultQueueDrawer";
import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import { vaultModeRootClass } from "@/components/break-host/vault/vault-modes";
import { LiveRoomEnergyMeter } from "@/components/live-stage/LiveRoomEnergyMeter";
import type { LiveStageMotionBurst } from "@/components/live-stage/LiveAuctionHud";
import {
  LiveLotTransitionBanner,
  type LiveLotTransitionPhase,
} from "@/components/live-stage/LiveLotTransitionBanner";
import {
  computeLiveRoomEnergy,
  countRecentBids,
  isBidWar,
  pushBidTimestamp,
} from "@/lib/live-room-energy";
import { HostStreamSetupCard } from "@/components/live-auction/HostStreamSetupCard";
import { useRealtimeRoomSubscription } from "@/hooks/useRealtimeRoomSubscription";
import { useLiveRoomModerationState } from "@/hooks/useLiveRoomModerationState";
import { logLiveDebugEvent } from "@/lib/live-debug";
import {
  createLiveRoomItem,
  deleteLiveRoomItem,
  patchLiveRoomAction,
  patchLiveRoomItemStatus,
  sendLiveRoomSystemMessage,
  startLiveRoomItemAuction,
  beginLiveRoomTeamBreak,
} from "@/lib/live-room-control-client";
import { appendLiveRoomMessageDedupe, mergeLiveRoomMessagesById } from "@/lib/realtime-merge-messages";
import type { LiveRoomItemDTO, LiveRoomMessageDTO, SellerPaymentFailureDTO } from "@/lib/live-room-serialize";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import {
  mergeLiveRoomItemsForActiveItemEvent,
  mergeLiveRoomItemsForBidPlaced,
} from "@/lib/live-room-realtime-merge";
import { estimateClockSkewMs, syncedWallTimeMs } from "@/lib/server-clock-sync";
import { parsePurchaseCompletedCelebration, type LiveAuctionCloseCelebration } from "@/lib/live-auction-winner-display";
import { liveAuctionDisplayBidUsd } from "@/lib/live-auction-overlay-price";
import { parseTeamBoardPublicPayload, type TeamBoardPublicPayload } from "@/lib/team-board-public";

type RoomPayload = {
  id: string;
  sellerId: string;
  title: string;
  status: string;
  roomVersion: number;
  viewerCount: number;
  breakFormat: string;
  breakDisplayTitle: string;
  breakSpotPriceUsd: number | null;
  breakTotalSpots: number | null;
  breakTeamLabels: string[];
  breakFilledLockedAt: string | null;
  assignmentsLockedAt: string | null;
  randomizedAt: string | null;
  randomizationSeed: string | null;
  randomizationPreview: string | null;
  randomizationResult: string | null;
  lockPurchases: boolean;
  breakPaused: boolean;
  teamBoardLeague: "nfl" | "nba" | "mlb";
  scheduledStartAt: string | null;
  /** When the seller started the live room (host console “Start stream”). */
  startedAt: string | null;
  thumbnailUrl?: string | null;
};

type ClaimRow = {
  id: string;
  spotLabel: string;
  priceUsd: number;
  claimStatus: string;
  paidAt: string | null;
  lockedAt: string | null;
  user: { id: string; username: string; email: string };
  createdAt: string;
};

type QueueRow = {
  /** Full row from host-console API (`serializeLiveRoomItem` + high-bidder enrichment). */
  item: LiveRoomItemDTO;
  claim: ClaimRow | null;
  claims: ClaimRow[];
};

type HitRow = {
  id: string;
  liveRoomItemId: string | null;
  title: string;
  spotLabel: string;
  notes: string;
  imageUrl: string;
  buyer: { id: string; username: string } | null;
  createdAt: string;
};

type HostPayload = {
  room: RoomPayload;
  queueItems: QueueRow[];
  orphanSpots: ClaimRow[];
  messages: LiveRoomMessageDTO[];
  hits: HitRow[];
  isAdmin: boolean;
  recentSales?: HostRecentSaleRowDTO[];
  feeTier?: LiveShowFeeTierSnapshot | null;
  sellerUnresolvedPaymentFailures?: SellerPaymentFailureDTO[];
};

function fmtHostSpotUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "$—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtHostQueueMoney(
  item: Pick<
    QueueRow["item"],
    "priceUsd" | "startingBidUsd" | "currentBidUsd" | "lastHighBidderId" | "lastHighBidderUsername"
  >,
) {
  return fmtHostSpotUsd(
    liveAuctionDisplayBidUsd({
      currentBidUsd: item.currentBidUsd,
      startingBidUsd: item.startingBidUsd,
      lastHighBidderId: item.lastHighBidderId,
      lastHighBidderUsername: item.lastHighBidderUsername,
    }),
  );
}

const HOST_AUCTION_DURATION_CHOICES: { sec: number; label: string }[] = [
  { sec: 5, label: "5s" },
  { sec: 10, label: "10s" },
  { sec: 15, label: "15s" },
  { sec: 20, label: "20s" },
  { sec: 30, label: "30s" },
];

function formatHostAuctionCountdownMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function hostQueueTitleLine(item: Pick<LiveRoomItemDTO, "title" | "displayTitle">) {
  return item.displayTitle?.trim() || item.title;
}

/** Elapsed since room went live (H:MM:SS). */
function formatLiveDurationHms(startedAtIso: string, nowMs: number) {
  const t0 = new Date(startedAtIso).getTime();
  if (Number.isNaN(t0)) return "0:00:00";
  const sec = Math.max(0, Math.floor((nowMs - t0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function BreakHostConsole({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<HostPayload | null>(null);
  const hostDataRef = useRef<HostPayload | null>(null);
  hostDataRef.current = data;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Short-lived buyer/room activity hint (does not replace error `toast`). */
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const hostNoticeTimerRef = useRef<number | null>(null);
  const lastBreakSpotNoticeAtRef = useRef(0);

  const [systemMsg, setSystemMsg] = useState("");

  const [queueAddModal, setQueueAddModal] = useState<null | "auction" | "bin" | "givvy">(null);
  const [obsSetupModalOpen, setObsSetupModalOpen] = useState(false);

  const [teamBoardData, setTeamBoardData] = useState<TeamBoardPublicPayload | null>(null);
  const [teamBoardBusy, setTeamBoardBusy] = useState(false);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState("");
  const [hostAuctionDurationSec, setHostAuctionDurationSec] = useState(5);
  const [hostClutchTimeEnabled, setHostClutchTimeEnabled] = useState(false);
  const [streamPreviewMuted, setStreamPreviewMuted] = useState(true);
  const [hostLiveItemAuctionBusy, setHostLiveItemAuctionBusy] = useState(false);
  const [teamBreakBusy, setTeamBreakBusy] = useState(false);
  const [auctionTickHost, setAuctionTickHost] = useState(0);
  const [hostClockSkewMs, setHostClockSkewMs] = useState(0);
  const [hostQueueTab, setHostQueueTab] = useState<"auction" | "bin" | "givvy" | "sold">("auction");
  const [vaultMode, setVaultMode] = useState<VaultMode>("auction_night");
  const [vaultCommandOpen, setVaultCommandOpen] = useState(false);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [stageMotionBurst, setStageMotionBurst] = useState<LiveStageMotionBurst>(null);
  const [bidsLastMinute, setBidsLastMinute] = useState(0);
  const [lotTransitionPhase, setLotTransitionPhase] = useState<LiveLotTransitionPhase>("idle");
  const [lotTransitionWinner, setLotTransitionWinner] = useState<string | null>(null);
  const [lotTransitionAmount, setLotTransitionAmount] = useState<string | null>(null);
  const [lotTransitionNextTitle, setLotTransitionNextTitle] = useState<string | null>(null);
  const bidTimestampsRef = useRef<number[]>([]);
  const stageMotionTimerRef = useRef<number | null>(null);
  const lotTransitionTimerRef = useRef<number | null>(null);
  const lotTransitionTimersRef = useRef<number[]>([]);
  const [realtimeConnectionStatus, setRealtimeConnectionStatus] = useState("Connecting…");
  const [soldCelebration, setSoldCelebration] = useState<LiveAuctionCloseCelebration | null>(null);
  const lastRefreshAtRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);
  const fallbackRefreshTimerRef = useRef<number | null>(null);
  const lastRoomVersionRef = useRef(0);
  const lastItemVersionRef = useRef<Record<string, number>>({});
  const lastEventAtByTypeRef = useRef<Record<string, number>>({});
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const [streamPlaybackRefreshNonce, setStreamPlaybackRefreshNonce] = useState(0);
  const [hostStreamCardRefreshNonce, setHostStreamCardRefreshNonce] = useState(0);
  const hostModeration = useLiveRoomModerationState(roomId, true);
  const [modBusy, setModBusy] = useState(false);
  const [modError, setModError] = useState<string | null>(null);

  /** After first successful host-console load for this mount/room; avoids wiping UI on poll network blips. */
  const hostConsoleHydratedRef = useRef(false);

  const publicUrl = useMemo(() => `${typeof window !== "undefined" ? window.location.origin : ""}/live/${encodeURIComponent(roomId)}`, [roomId]);

  useEffect(() => {
    hostConsoleHydratedRef.current = false;
  }, [roomId]);

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/host-console`, { cache: "no-store" });
      const t1 = Date.now();
      if (!res.ok) {
        const raw = await res.text();
        let msg = `Could not load host console (HTTP ${res.status}).`;
        try {
          const j = JSON.parse(raw) as { error?: string; detail?: string };
          if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
          if (res.status >= 500 && typeof j.detail === "string" && j.detail.trim()) {
            msg = `${msg} ${j.detail.trim()}`;
          }
        } catch {
          /* ignore */
        }
        if (res.status === 403 && msg.includes("only for break")) {
          msg = "Host console is only for break rooms. Open the public room page instead.";
        }
        if (res.status === 404) {
          msg = "Host console: room not found. Check the URL or DATABASE_URL.";
        }
        if (hostConsoleHydratedRef.current && res.status >= 500) {
          setRefreshWarning(`${msg} Showing last synced queue — retrying automatically.`);
          return;
        }
        if (hostConsoleHydratedRef.current && res.status !== 404 && res.status !== 403) {
          setRefreshWarning(msg);
          return;
        }
        setLoadError(msg);
        setData(null);
        hostConsoleHydratedRef.current = false;
        return;
      }
      setLoadError(null);
      setRefreshWarning(null);
      const j = (await res.json()) as HostPayload & { serverNowMs?: number };
      if (typeof j.serverNowMs === "number") {
        setHostClockSkewMs(estimateClockSkewMs(t0, t1, j.serverNowMs));
      }
      if (!j?.room || typeof j.room.status !== "string") {
        if (hostConsoleHydratedRef.current) {
          setRefreshWarning("Host console returned invalid room data. Showing last synced queue.");
          return;
        }
        setLoadError("Could not load host console (invalid room data).");
        setData(null);
        hostConsoleHydratedRef.current = false;
        return;
      }
      setData((prev) => {
        if (!prev) {
          return {
            ...j,
            recentSales: j.recentSales ?? [],
            feeTier: j.feeTier ?? null,
            sellerUnresolvedPaymentFailures: j.sellerUnresolvedPaymentFailures ?? [],
          };
        }
        return {
          ...j,
          recentSales: j.recentSales ?? prev.recentSales ?? [],
          feeTier: j.feeTier ?? prev.feeTier ?? null,
          sellerUnresolvedPaymentFailures: j.sellerUnresolvedPaymentFailures ?? prev.sellerUnresolvedPaymentFailures ?? [],
          messages: mergeLiveRoomMessagesById(prev.messages, j.messages),
        };
      });
      lastRoomVersionRef.current = typeof j.room?.roomVersion === "number" ? j.room.roomVersion : lastRoomVersionRef.current;
      const nextItemVersions: Record<string, number> = {};
      for (const row of j.queueItems ?? []) {
        if (typeof row.item.itemVersion === "number") nextItemVersions[row.item.id] = row.item.itemVersion;
      }
      lastItemVersionRef.current = nextItemVersions;
      lastRefreshAtRef.current = Date.now();
      hostConsoleHydratedRef.current = true;
    } catch {
      if (!hostConsoleHydratedRef.current) {
        setLoadError("Could not reach the server. Check your connection or refresh.");
        setData(null);
      } else {
        setRefreshWarning("Could not refresh the queue. Showing last synced state — retrying automatically.");
      }
    }
  }, [roomId]);

  const scheduleFallbackRefresh = useCallback(
    (reason: string, delayMs = 120) => {
      if (fallbackRefreshTimerRef.current != null) window.clearTimeout(fallbackRefreshTimerRef.current);
      fallbackRefreshTimerRef.current = window.setTimeout(() => {
        fallbackRefreshTimerRef.current = null;
        logLiveDebugEvent({
          event: "fallback_refresh",
          roomId,
          lastRefreshAtMs: lastRefreshAtRef.current,
          extra: { reason, surface: "host_console" },
        });
        void load();
      }, Math.max(0, delayMs));
    },
    [load, roomId],
  );

  const activeBoardRow = useMemo(() => {
    const rows = data?.queueItems;
    if (!rows?.length) return null;
    return rows.find((q) => q.item.status.toLowerCase() === "active") ?? null;
  }, [data?.queueItems]);

  useEffect(() => {
    const row = activeBoardRow;
    if (!row?.item.biddingOpen || !row.item.auctionEndsAt) return undefined;
    const ends = Date.parse(row.item.auctionEndsAt);
    if (!Number.isFinite(ends)) return undefined;
    const id = window.setInterval(() => setAuctionTickHost((n) => n + 1), 50);
    return () => window.clearInterval(id);
  }, [activeBoardRow]);

  const handleHostStartLiveItemAuction = useCallback(async () => {
    const row =
      hostDataRef.current?.queueItems.find((q) => q.item.status.toLowerCase() === "active") ?? null;
    const targetItem = row?.item;
    console.log("[stage hud] start clicked", {
      roomId,
      itemId: targetItem?.id ?? null,
      salesFormat: targetItem?.salesFormat ?? null,
      biddingOpen: targetItem?.biddingOpen ?? null,
      status: targetItem?.status ?? null,
    });
    if (!row || !targetItem) {
      setToast("Pin a lot first, then start bidding.");
      return;
    }
    if (isVariantSalesFormat(targetItem.salesFormat)) {
      setToast("Spot-sale breaks open for purchase when pinned — no auction start.");
      return;
    }
    setHostLiveItemAuctionBusy(true);
    setToast(null);
    let success = false;
    try {
      const res = await startLiveRoomItemAuction(roomId, targetItem.id, hostAuctionDurationSec, hostClutchTimeEnabled);
      if (!res.ok) {
        setToast(res.error);
        return;
      }
      success = true;
      const d = res.data as {
        breakRoundClosed?: unknown;
        serverNowMs?: number;
        item?: unknown;
        roomVersion?: number;
        itemVersion?: number;
        auctionEndsAt?: string | null;
        biddingOpen?: boolean;
        clutchTimeEnabled?: boolean;
      };
      if (d.breakRoundClosed === true) {
        setToast("Last unit sold — this lot is complete.");
      } else {
        setToast("Bidding is open.");
      }
      if (typeof d.serverNowMs === "number") {
        const t = Date.now();
        setHostClockSkewMs(estimateClockSkewMs(t, t, d.serverNowMs));
      }
      const aid = targetItem.id;
      const base =
        d.item && typeof d.item === "object" && typeof (d.item as LiveRoomItemDTO).id === "string"
          ? (d.item as LiveRoomItemDTO)
          : targetItem;
      const merged: LiveRoomItemDTO = {
        ...base,
        auctionEndsAt:
          typeof d.auctionEndsAt === "string" || d.auctionEndsAt === null ? d.auctionEndsAt : base.auctionEndsAt,
        biddingOpen: typeof d.biddingOpen === "boolean" ? d.biddingOpen : base.biddingOpen,
        clutchTimeEnabled: typeof d.clutchTimeEnabled === "boolean" ? d.clutchTimeEnabled : base.clutchTimeEnabled,
        itemVersion:
          typeof d.itemVersion === "number" ? Math.max(base.itemVersion, d.itemVersion) : base.itemVersion,
      };
      const rv = typeof d.roomVersion === "number" ? d.roomVersion : undefined;
      if (typeof rv === "number") {
        lastRoomVersionRef.current = Math.max(lastRoomVersionRef.current, rv);
      }
      lastItemVersionRef.current[merged.id] = Math.max(lastItemVersionRef.current[merged.id] ?? 0, merged.itemVersion);
      setData((prev) => {
        if (!prev) return prev;
        const queueItems = prev.queueItems.map((row) => (row.item.id === aid ? { ...row, item: merged } : row));
        const roomVersion =
          typeof rv === "number" ? Math.max(prev.room.roomVersion ?? 0, rv) : prev.room.roomVersion;
        return { ...prev, room: { ...prev.room, roomVersion }, queueItems };
      });
      setAuctionTickHost((n) => n + 1);
    } finally {
      setHostLiveItemAuctionBusy(false);
    }
    if (success) {
      queueMicrotask(() => {
        void load();
        router.refresh();
      });
    }
  }, [hostAuctionDurationSec, hostClutchTimeEnabled, load, roomId, router]);

  const shouldProcessRealtimePayload = useCallback(
    (type: string, payload: Record<string, unknown> | null | undefined): boolean => {
      if (!payload) return true;
      const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
      if (eventId) {
        if (seenEventIdsRef.current.has(eventId)) return false;
        seenEventIdsRef.current.add(eventId);
        if (seenEventIdsRef.current.size > 500) {
          seenEventIdsRef.current = new Set(Array.from(seenEventIdsRef.current).slice(-250));
        }
      }
      const emittedAt = typeof payload.emittedAt === "string" ? payload.emittedAt : null;
      if (emittedAt) {
        const emittedMs = Date.parse(emittedAt);
        if (!Number.isNaN(emittedMs)) {
          const last = lastEventAtByTypeRef.current[type] ?? 0;
          if (emittedMs < last) return false;
          lastEventAtByTypeRef.current[type] = emittedMs;
        }
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

  const flashHostNotice = useCallback((msg: string) => {
    setHostNotice(msg);
    if (hostNoticeTimerRef.current != null) window.clearTimeout(hostNoticeTimerRef.current);
    hostNoticeTimerRef.current = window.setTimeout(() => {
      setHostNotice(null);
      hostNoticeTimerRef.current = null;
    }, 3200);
  }, []);

  const handleBeginTeamBreak = useCallback(async () => {
    const row =
      hostDataRef.current?.queueItems.find((q) => q.item.status.toLowerCase() === "active") ?? null;
    if (!row?.item.variantBreakReadyAt || row.item.variantBreakBeganAt) return;
    setTeamBreakBusy(true);
    setToast(null);
    try {
      const res = await beginLiveRoomTeamBreak(roomId, row.item.id);
      if (!res.ok) {
        setToast(res.error);
        return;
      }
      setToast("Break has begun.");
      flashHostNotice("Break has begun.");
      await load();
      router.refresh();
    } finally {
      setTeamBreakBusy(false);
    }
  }, [flashHostNotice, load, roomId, router]);

  const flashStageMotion = useCallback((burst: LiveStageMotionBurst, ms = 750) => {
    setStageMotionBurst(burst);
    if (stageMotionTimerRef.current != null) window.clearTimeout(stageMotionTimerRef.current);
    stageMotionTimerRef.current = window.setTimeout(() => {
      setStageMotionBurst(null);
      stageMotionTimerRef.current = null;
    }, ms);
  }, []);

  const clearLotTransitionTimers = useCallback(() => {
    if (lotTransitionTimerRef.current != null) {
      window.clearTimeout(lotTransitionTimerRef.current);
      lotTransitionTimerRef.current = null;
    }
    for (const id of lotTransitionTimersRef.current) window.clearTimeout(id);
    lotTransitionTimersRef.current = [];
  }, []);

  const scheduleLotTransition = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    lotTransitionTimersRef.current.push(id);
    return id;
  }, []);

  const runLotSoldTransition = useCallback(
    (winner: string | null, amount: string | null, nextTitle: string | null) => {
      clearLotTransitionTimers();
      setLotTransitionWinner(winner);
      setLotTransitionAmount(amount);
      setLotTransitionNextTitle(nextTitle);
      setLotTransitionPhase("sold_spotlight");
      flashStageMotion("sold", 1400);

      scheduleLotTransition(() => {
        setLotTransitionPhase("next_intro");
        scheduleLotTransition(() => {
          if (nextTitle) {
            setLotTransitionPhase("incoming");
            scheduleLotTransition(() => {
              setLotTransitionPhase("idle");
              setLotTransitionWinner(null);
              setLotTransitionAmount(null);
              setLotTransitionNextTitle(null);
            }, 1200);
          } else {
            setLotTransitionPhase("idle");
            setLotTransitionWinner(null);
            setLotTransitionAmount(null);
          }
        }, 900);
      }, 1600);
    },
    [clearLotTransitionTimers, flashStageMotion, scheduleLotTransition],
  );

  useEffect(
    () => () => {
      if (hostNoticeTimerRef.current != null) window.clearTimeout(hostNoticeTimerRef.current);
      if (stageMotionTimerRef.current != null) window.clearTimeout(stageMotionTimerRef.current);
      clearLotTransitionTimers();
    },
    [clearLotTransitionTimers],
  );

  const loadTeamBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/team-board`, { cache: "no-store" });
      if (!res.ok) return;
      const raw: unknown = await res.json();
      const j = parseTeamBoardPublicPayload(raw);
      if (j) setTeamBoardData(j);
    } catch {
      /* ignore transient network errors */
    }
  }, [roomId]);

  const mergeHostMessagesFromApi = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { messages?: LiveRoomMessageDTO[] };
      const incoming = Array.isArray(j.messages) ? j.messages : [];
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, messages: mergeLiveRoomMessagesById(prev.messages, incoming) };
      });
    } catch {
      /* Failed to fetch — next poll retries */
    }
  }, [roomId]);

  const runHostModeration = useCallback(
    async (actionType: string, extra?: { targetUserId?: string; metadata?: Record<string, unknown> }) => {
      setModBusy(true);
      setModError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/moderation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionType, ...extra }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setModError(j.error ?? "Moderation action failed.");
          return;
        }
        void hostModeration.reload();
      } finally {
        setModBusy(false);
      }
    },
    [hostModeration, roomId],
  );

  const assignHostModerator = useCallback(
    async (userId: string) => {
      setModBusy(true);
      setModError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/moderators`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setModError(j.error ?? "Could not assign moderator.");
          return;
        }
        void hostModeration.reload();
      } finally {
        setModBusy(false);
      }
    },
    [hostModeration, roomId],
  );

  const revokeHostModerator = useCallback(
    async (userId: string) => {
      setModBusy(true);
      setModError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/moderators`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setModError(j.error ?? "Could not remove moderator.");
          return;
        }
        void hostModeration.reload();
      } finally {
        setModBusy(false);
      }
    },
    [hostModeration, roomId],
  );

  const chatPollLive = data?.room?.status?.toLowerCase() === "live";
  useEffect(() => {
    if (!chatPollLive) return;
    void mergeHostMessagesFromApi();
    const id = window.setInterval(() => void mergeHostMessagesFromApi(), 4000);
    return () => window.clearInterval(id);
  }, [chatPollLive, mergeHostMessagesFromApi]);

  useEffect(() => {
    void load();
    const hasRealtime = Boolean(getSupabaseBrowserClient());
    const t = setInterval(() => void load(), hasRealtime ? 15000 : 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    void loadTeamBoard();
  }, [loadTeamBoard]);

  useEffect(() => {
    const onVisibilityOrOnline = () => {
      scheduleFallbackRefresh("visibility_or_online", 60);
    };
    document.addEventListener("visibilitychange", onVisibilityOrOnline);
    window.addEventListener("online", onVisibilityOrOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityOrOnline);
      window.removeEventListener("online", onVisibilityOrOnline);
      if (fallbackRefreshTimerRef.current != null) window.clearTimeout(fallbackRefreshTimerRef.current);
    };
  }, [scheduleFallbackRefresh]);

  useEffect(() => {
    if (!data?.queueItems?.length) {
      setSelectedQueueItemId("");
      return;
    }
    setSelectedQueueItemId((prev) => {
      const active = data.queueItems.find((q) => q.item.status === "active");
      if (active) return active.item.id;
      if (prev && data.queueItems.some((q) => q.item.id === prev)) return prev;
      const queued = data.queueItems.find((q) => q.item.status === "queued");
      return (active ?? queued ?? data.queueItems[0]).item.id;
    });
  }, [data]);

  useRealtimeRoomSubscription({
    liveRoomId: roomId,
    enabled: Boolean(roomId),
    onLiveRoomMessage: (m) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "chat_message", surface: "host_console" },
      });
      if (m.messageType === "purchase") {
        flashHostNotice("Purchase · check chat / sales");
      }
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, messages: appendLiveRoomMessageDedupe(prev.messages, m) };
      });
    },
    onMessagesRefreshMerge: () => void mergeHostMessagesFromApi(),
    onQueueItemsChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "queue_items", surface: "host_console" },
      });
      void load();
    },
    onTeamBreakReady: () => {
      flashHostNotice("All divisions sold. Break is ready to begin.");
      void load();
    },
    onTeamBreakBegan: () => {
      flashHostNotice("Break has begun.");
      void load();
    },
    onBreakSpotsChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "break_spots", surface: "host_console" },
      });
      const now = Date.now();
      if (now - lastBreakSpotNoticeAtRef.current > 12_000) {
        lastBreakSpotNoticeAtRef.current = now;
        flashHostNotice("Spots / claims updated");
      }
      void load();
      void loadTeamBoard();
    },
    onListingBid: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "listing_bid", surface: "host_console" },
      });
      void load();
    },
    onTeamBoardChange: () => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "team_board", surface: "host_console" },
      });
      void loadTeamBoard();
    },
    onBidPlaced: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "bid_placed", surface: "host_console" },
      });
      if (!shouldProcessRealtimePayload("bid_placed", payload)) return;
      const amt = typeof payload.amountUsd === "number" ? payload.amountUsd : null;
      if (amt != null) flashHostNotice(`Live bid · ${fmtHostSpotUsd(amt)}`);
      const now = Date.now();
      bidTimestampsRef.current = pushBidTimestamp(bidTimestampsRef.current, now);
      setBidsLastMinute(countRecentBids(bidTimestampsRef.current, now));
      const bidWar = isBidWar(bidTimestampsRef.current, now);
      const activeEnds = hostDataRef.current?.queueItems.find((q) => q.item.status === "active")?.item.auctionEndsAt;
      let lastSecond = false;
      if (activeEnds) {
        const ends = Date.parse(activeEnds);
        const skew = hostClockSkewMs;
        const remaining = ends - (now + (Number.isFinite(skew) ? skew : 0));
        lastSecond = Number.isFinite(remaining) && remaining <= 5000 && remaining > 0;
      }
      flashStageMotion(bidWar ? "bid_war" : lastSecond ? "last_second" : "bid");
      setData((prev) => {
        if (!prev || typeof payload.amountUsd !== "number" || typeof payload.itemId !== "string") return prev;
        const flat = prev.queueItems.map((r) => r.item);
        const mergedFlat = mergeLiveRoomItemsForBidPlaced(flat, payload);
        const byId = new Map(mergedFlat.map((it) => [it.id, it]));
        const queueItems = prev.queueItems.map((row) => {
          const it = byId.get(row.item.id);
          return it ? { ...row, item: it } : row;
        });
        return {
          ...prev,
          room: {
            ...prev.room,
            roomVersion:
              typeof payload.roomVersion === "number" ? Math.max(prev.room.roomVersion ?? 0, payload.roomVersion) : prev.room.roomVersion,
          },
          queueItems,
        };
      });
      const snBid = (payload as Record<string, unknown>).serverNowMs;
      if (typeof snBid === "number") {
        const t = Date.now();
        setHostClockSkewMs(estimateClockSkewMs(t, t, snBid));
      }
    },
    onActiveItemChanged: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "active_item_changed", surface: "host_console" },
      });
      if (!shouldProcessRealtimePayload("active_item_changed", payload)) return;
      if (!payload.itemId) {
        scheduleFallbackRefresh("active_item_changed_missing_item", 80);
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        const flat = prev.queueItems.map((r) => r.item);
        const mergedFlat = mergeLiveRoomItemsForActiveItemEvent(flat, payload);
        const byId = new Map(mergedFlat.map((it) => [it.id, it]));
        const queueItems = prev.queueItems.map((row) => {
          const it = byId.get(row.item.id);
          return it ? { ...row, item: it } : row;
        });
        const roomVersion =
          typeof payload.roomVersion === "number"
            ? Math.max(prev.room.roomVersion ?? 0, payload.roomVersion)
            : prev.room.roomVersion;
        return { ...prev, room: { ...prev.room, roomVersion }, queueItems };
      });
      const snActive = (payload as Record<string, unknown>).serverNowMs;
      if (typeof snActive === "number") {
        const t = Date.now();
        setHostClockSkewMs(estimateClockSkewMs(t, t, snActive));
      }
      scheduleFallbackRefresh("active_item_changed_reconcile", 120);
    },
    onAuctionStarted: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "auction_started", surface: "host_console" },
      });
      if (!shouldProcessRealtimePayload("auction_started", payload)) return;
      flashHostNotice("Room is live for buyers");
      setData((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              room: {
                ...prev.room,
                status: "live",
                roomVersion:
                  typeof payload.roomVersion === "number" ? Math.max(prev.room.roomVersion ?? 0, payload.roomVersion) : prev.room.roomVersion,
              },
            },
      );
      const snStarted = (payload as Record<string, unknown>).serverNowMs;
      if (typeof snStarted === "number") {
        const t = Date.now();
        setHostClockSkewMs(estimateClockSkewMs(t, t, snStarted));
      }
    },
    onAuctionEnded: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "auction_ended", surface: "host_console" },
      });
      if (!shouldProcessRealtimePayload("auction_ended", payload)) return;
      flashHostNotice("Auction ended · room closing for buyers");
      setData((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              room: {
                ...prev.room,
                status: "ended",
                roomVersion:
                  typeof payload.roomVersion === "number" ? Math.max(prev.room.roomVersion ?? 0, payload.roomVersion) : prev.room.roomVersion,
              },
            },
      );
    },
    onPurchaseCompleted: (payload) => {
      logLiveDebugEvent({
        event: "event_received",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { type: "purchase_completed", surface: "host_console" },
      });
      if (!shouldProcessRealtimePayload("purchase_completed", payload)) return;
      const celebration = parsePurchaseCompletedCelebration(payload);
      if (celebration) setSoldCelebration(celebration);
      if (celebration?.kind === "sold") {
        const nextQueued = hostDataRef.current?.queueItems.find((q) => q.item.status === "queued");
        const nextTitle = nextQueued?.item.displayTitle?.trim() || nextQueued?.item.title || null;
        runLotSoldTransition(
          celebration.winnerUsername,
          fmtHostSpotUsd(celebration.winningAmountUsd),
          nextTitle,
        );
      } else if (celebration?.kind === "no_bids") {
        flashStageMotion("no_bids", 1200);
        setLotTransitionPhase("idle");
      }
      if (payload.paymentStatus === "payment_failed") {
        const who =
          celebration?.kind === "sold" ? celebration.winnerUsername ?? "buyer" : "buyer";
        flashHostNotice(`Payment failed · @${who.replace(/^@/, "")} — awaiting recovery`);
      } else {
        flashHostNotice("Item sold · syncing");
      }
      scheduleFallbackRefresh("purchase_completed", 40);
    },
    onPaymentFailed: (payload) => {
      const who = payload.buyerUsername?.trim() || "buyer";
      const amt =
        typeof payload.amountUsd === "number" && Number.isFinite(payload.amountUsd)
          ? fmtHostSpotUsd(payload.amountUsd)
          : "";
      flashHostNotice(`Payment failed · @${who.replace(/^@/, "")}${amt ? ` · ${amt}` : ""}`);
      void load();
    },
    onPaymentRecovered: (payload) => {
      const who = payload.buyerUsername?.trim() || "buyer";
      flashHostNotice(`Payment recovered for @${who.replace(/^@/, "")}`);
      void load();
    },
    onRoomStateEvent: () => scheduleFallbackRefresh("room_state_event", 100),
    onStreamStatusChange: () => {
      setStreamPlaybackRefreshNonce((n) => n + 1);
      setHostStreamCardRefreshNonce((n) => n + 1);
    },
    onReconnect: () => {
      reconnectCountRef.current += 1;
      logLiveDebugEvent({
        event: "realtime_reconnect",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { reconnectCount: reconnectCountRef.current, surface: "host_console" },
      });
      setStreamPlaybackRefreshNonce((n) => n + 1);
      setHostStreamCardRefreshNonce((n) => n + 1);
      scheduleFallbackRefresh("reconnect", 40);
    },
    onConnectionStateChange: ({ status, reconnectCount }) => {
      if (status === "SUBSCRIBED") setRealtimeConnectionStatus("Connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setRealtimeConnectionStatus("Reconnecting…");
      } else if (status === "JOINING") {
        setRealtimeConnectionStatus(reconnectCount > 0 ? "Reconnecting…" : "Connecting…");
      }
      logLiveDebugEvent({
        event: "realtime_connection_state",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { status, reconnectCount, surface: "host_console" },
      });
    },
  });

  const patchTeamBoard = async (body: Record<string, unknown>) => {
    setTeamBoardBusy(true);
    setToast(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/team-board`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw: unknown = await res.json().catch(() => ({}));
      const j = raw as { error?: unknown; message?: unknown };
      if (!res.ok) {
        const err = j.error;
        const msg =
          typeof err === "string"
            ? err
            : typeof j.message === "string"
              ? j.message
              : `Team board update failed (${res.status}).`;
        setToast(msg);
        return false;
      }
      const parsed = parseTeamBoardPublicPayload(raw);
      if (parsed) setTeamBoardData(parsed);
      await loadTeamBoard();
      router.refresh();
      return true;
    } finally {
      setTeamBoardBusy(false);
    }
  };

  const patchRoom = (action: "start" | "end") => {
    if (action === "end" && !window.confirm("End this live room for everyone?")) return;
    return void (async () => {
      setBusy(true);
      setToast(null);
      try {
        const res = await patchLiveRoomAction(roomId, action);
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return;
        }
        await load();
        router.refresh();
      } finally {
        setBusy(false);
      }
    })();
  };

  const sendSystem = () => {
    if (!systemMsg.trim()) return;
    return void (async () => {
      setBusy(true);
      setToast(null);
      try {
        const res = await sendLiveRoomSystemMessage(roomId, systemMsg.trim());
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return;
        }
        setSystemMsg("");
        await mergeHostMessagesFromApi();
        router.refresh();
      } finally {
        setBusy(false);
      }
    })();
  };

  const patchItem = (itemId: string, status: string) => {
    if (status !== "queued" && status !== "active" && status !== "sold" && status !== "skipped") return;
    return void (async () => {
      setBusy(true);
      setToast(null);
      try {
        const res = await patchLiveRoomItemStatus(roomId, itemId, status);
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return;
        }
        await load();
        router.refresh();
      } finally {
        setBusy(false);
      }
    })();
  };

  const deleteQueueItem = (itemId: string) =>
    void (async () => {
      setBusy(true);
      setToast(null);
      try {
        const res = await deleteLiveRoomItem(roomId, itemId);
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return;
        }
        setSelectedQueueItemId((prev) => (prev === itemId ? "" : prev));
        await load();
        router.refresh();
      } finally {
        setBusy(false);
      }
    })();

  const handleQueueAddModalClose = useCallback((_reason: AddQueueItemCloseReason) => {
    setQueueAddModal(null);
  }, []);

  const handleSubmitAuctionAdd = useCallback(
    async (payload: AddQueueItemAuctionPayload): Promise<boolean> => {
      const miscPayload =
        hostDataRef.current?.room.teamBoardLeague === "nfl" ? { teamBoardMisc: payload.teamBoardMisc } : {};
      const variantPayload = isVariantSalesFormat(payload.salesFormat)
        ? { salesFormat: payload.salesFormat, variants: payload.variants }
        : { salesFormat: payload.salesFormat };
      setBusy(true);
      setToast(null);
      try {
        const res = await createLiveRoomItem(roomId, {
          title: payload.title,
          priceUsd: payload.priceUsd,
          startingBidUsd: payload.startingBidUsd,
          quantity: payload.quantity,
          ...miscPayload,
          ...variantPayload,
        });
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return false;
        }
        await load();
        router.refresh();
        setToast("Added to queue.");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message.trim() : "";
        setToast(msg ? `Could not add item (${msg}).` : "Could not add item. Check your connection and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, roomId, router],
  );

  const copyPublic = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setToast("Public link copied.");
    } catch {
      setToast("Could not copy link.");
    }
  };

  const toggleStreamPreviewMute = useCallback(() => {
    setStreamPreviewMuted((prev) => {
      const next = !prev;
      const video = document.querySelector<HTMLVideoElement>('video[data-live-stage-video="true"]');
      if (video) {
        video.muted = next;
        if (!next) void video.play().catch(() => undefined);
      }
      return next;
    });
  }, []);

  const [liveStreamTimerTick, setLiveStreamTimerTick] = useState(0);
  const liveStreamTimerActive = data?.room?.status === "live" && Boolean(data.room.startedAt);
  useEffect(() => {
    if (!liveStreamTimerActive) return;
    const id = window.setInterval(() => setLiveStreamTimerTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveStreamTimerActive]);

  useEffect(() => {
    if (!obsSetupModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setObsSetupModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [obsSetupModalOpen]);

  if (loadError && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050508] px-4 text-center text-sm text-rose-300">
        <p>{loadError}</p>
        <Link href="/seller/live" className="mt-4 text-gold-bright hover:underline">
          ← Seller live
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[var(--site-header-offset)] z-40 flex flex-col overflow-hidden bg-[#050508]">
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
          <div className="mt-2 h-6 w-[min(80%,20rem)] animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
        </div>
        <div className="min-h-0 flex-1 animate-pulse p-3 motion-reduce:animate-none">
          <div className="h-[min(46dvh,26rem)] w-full rounded-2xl bg-white/[0.04]" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-11 rounded-xl bg-white/[0.05]" />
            <div className="h-11 rounded-xl bg-white/[0.05]" />
            <div className="h-11 rounded-xl bg-white/[0.05]" />
          </div>
        </div>
        <p className="sr-only">Loading host console</p>
      </div>
    );
  }

  const { room } = data;
  const roomStatusKey = room.status.toLowerCase();

  const hostUsername =
    session?.user?.username?.trim() ||
    session?.user?.name?.trim() ||
    session?.user?.email?.split("@")[0]?.trim() ||
    "Host";

  const streamTitle = room.breakDisplayTitle || room.title;
  /** Match buyer live room ticker style (no bid / claim strip on the stage). */
  const stageOverlayMessage = `${streamTitle}${room.breakPaused ? " · Break paused" : ""}${room.lockPurchases ? " · Purchases locked" : ""}`;

  void liveStreamTimerTick;
  const streamTimerDisplay =
    room.status === "live" && room.startedAt ? formatLiveDurationHms(room.startedAt, Date.now()) : "0:00:00";

  const handleHostTeamPick = async (teamAbbr: string) => {
    setTeamBoardBusy(true);
    setToast(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/team-board/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamAbbr }),
      });
      const raw: unknown = await res.json().catch(() => ({}));
      const errBody = raw as { error?: string };
      if (!res.ok) {
        setToast(typeof errBody.error === "string" ? errBody.error : "Could not record pick.");
        return;
      }
      const parsed = parseTeamBoardPublicPayload(raw);
      if (parsed) setTeamBoardData(parsed);
      await loadTeamBoard();
      router.refresh();
    } finally {
      setTeamBoardBusy(false);
    }
  };

  const teamBoardStageOverlay =
    teamBoardData && teamBoardData.state.visible ? (
      <TeamBoardOverlay
        state={teamBoardData.state}
        picks={teamBoardData.picks}
        teams={teamBoardData.teams}
        viewerUserId={session?.user?.id ?? null}
        isRoomHost
        canSelectTiles={room.status === "live" && !teamBoardData.state.locked}
        busy={teamBoardBusy}
        onPick={(abbr) => void handleHostTeamPick(abbr)}
      />
    ) : null;

  const selectedQueueRow =
    data.queueItems.find((q) => q.item.id === selectedQueueItemId) ?? data.queueItems[0] ?? null;

  const overlayQueueRow = activeBoardRow ?? selectedQueueRow;

  const biddingWindowStillRunningHost = Boolean(
    activeBoardRow?.item.biddingOpen &&
      !isVariantSalesFormat(activeBoardRow.item.salesFormat) &&
      activeBoardRow.item.auctionEndsAt &&
      Number.isFinite(Date.parse(activeBoardRow.item.auctionEndsAt)) &&
      Date.parse(activeBoardRow.item.auctionEndsAt) > syncedWallTimeMs(hostClockSkewMs),
  );
  void auctionTickHost;
  const hostAuctionCountdownLabel =
    activeBoardRow?.item.biddingOpen &&
    activeBoardRow.item.auctionEndsAt &&
    !isVariantSalesFormat(activeBoardRow.item.salesFormat)
      ? (() => {
          const ends = Date.parse(activeBoardRow.item.auctionEndsAt!);
          if (!Number.isFinite(ends)) return null;
          return formatHostAuctionCountdownMs(ends - syncedWallTimeMs(hostClockSkewMs));
        })()
      : null;
  const hostStartLiveAuctionEnabled =
    room.status === "live" &&
    activeBoardRow != null &&
    activeBoardRow.item.status === "active" &&
    !activeBoardRow.item.biddingOpen &&
    !isVariantSalesFormat(activeBoardRow.item.salesFormat);

  const recentChatCount = (() => {
    const cutoff = Date.now() - 120_000;
    return data.messages.filter((m) => {
      if (m.messageType !== "chat" && m.messageType !== "bid") return false;
      const t = Date.parse(m.createdAt);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
  })();

  const roomEnergy = computeLiveRoomEnergy({
    viewerCount: room.viewerCount,
    recentMessageCount: recentChatCount,
    bidsLastMinute,
    auctionLive: biddingWindowStillRunningHost,
  });

  const handleHostEndAuction = () => {
    const item = activeBoardRow?.item;
    if (!item) return;
    if (item.lastHighBidderId?.trim()) patchItem(item.id, "sold");
    else patchItem(item.id, "skipped");
  };

  const handleHostNextItem = () => {
    const active = activeBoardRow?.item;
    return void (async () => {
      if (active?.status === "active" && !biddingWindowStillRunningHost) {
        const status = active.lastHighBidderId?.trim() ? "sold" : "skipped";
        setBusy(true);
        setToast(null);
        try {
          const res = await patchLiveRoomItemStatus(roomId, active.id, status);
          if (!res.ok) {
            setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
            return;
          }
          const itemSoldOut = res.data?.itemSoldOut !== false;
          await load();
          router.refresh();
          if (!itemSoldOut) {
            setToast("Unit sold — next numbered unit is now active.");
            return;
          }
        } finally {
          setBusy(false);
        }
      }
      const next = hostDataRef.current?.queueItems.find((q) => q.item.status === "queued");
      if (next) patchItem(next.item.id, "active");
    })();
  };

  const handleHostPinSelected = () => {
    if (selectedQueueItemId) patchItem(selectedQueueItemId, "active");
  };

  const commandCenterProps = {
    roomTitle: streamTitle,
    roomStatus: room.status,
    viewerCount: room.viewerCount,
    streamTimerDisplay,
    connectionLabel: realtimeConnectionStatus,
    connectionOk: realtimeConnectionStatus === "Connected",
    busy,
    overlayQueueRow,
    activeBoardRow,
    hostAuctionCountdownLabel,
    biddingWindowOpen: biddingWindowStillRunningHost,
    hostStartLiveAuctionEnabled,
    hostLiveItemAuctionBusy,
    onPatchRoom: patchRoom,
    onStartAuction: () => void handleHostStartLiveItemAuction(),
    onEndAuction: handleHostEndAuction,
    onPinSelected: handleHostPinSelected,
    onNextItem: handleHostNextItem,
    queueTab: hostQueueTab,
    onQueueTab: setHostQueueTab,
    queueRows: data.queueItems,
    selectedQueueItemId,
    onSelectQueueItem: setSelectedQueueItemId,
    onPostItem: (id: string) => void patchItem(id, "active"),
    onSkipItem: (id: string) => void patchItem(id, "skipped"),
    onDeleteItem: (id: string) => void deleteQueueItem(id),
    onAddAuction: () => {
      setVaultCommandOpen(false);
      setQueueAddModal("auction");
    },
    onOpenObs: () => {
      setVaultCommandOpen(false);
      setObsSetupModalOpen(true);
    },
    onCopyPublic: () => void copyPublic(),
    recentSales: data.recentSales ?? [],
    feeTier: data.feeTier ?? null,
    vaultMode,
    onVaultModeChange: setVaultMode,
    roomEnergyScore: roomEnergy.score,
    roomEnergyLevel: roomEnergy.level,
    roomGovernance: {
      slowModeSeconds: hostModeration.slowModeSeconds,
      moderators: hostModeration.moderators,
      busy: modBusy,
      error: modError,
      onSetSlowMode: (seconds: number) => void runHostModeration("slow_mode", { metadata: { seconds } }),
      onAssignModerator: (userId: string) => void assignHostModerator(userId),
      onRevokeModerator: (userId: string) => void revokeHostModerator(userId),
    },
    onOpenQueueDrawer: () => setQueueDrawerOpen((v) => !v),
    queueDrawerOpen,
    uiDimmed: false,
  };

  const hostDesktopItemOverlay = (
    <VaultPinnedLot
      variant="desktop"
      embedded
      roomId={roomId}
      vaultMode={vaultMode}
      overlayQueueRow={overlayQueueRow}
      activeBoardRow={activeBoardRow}
      roomStatusLive={room.status === "live"}
      viewerCount={room.viewerCount}
      hostAuctionCountdownLabel={hostAuctionCountdownLabel}
      biddingWindowOpen={biddingWindowStillRunningHost}
      hostAuctionDurationSec={hostAuctionDurationSec}
      onHostAuctionDurationSec={setHostAuctionDurationSec}
      hostClutchTimeEnabled={hostClutchTimeEnabled}
      onToggleClutch={() => setHostClutchTimeEnabled((v) => !v)}
      hostStartLiveAuctionEnabled={hostStartLiveAuctionEnabled}
      hostLiveItemAuctionBusy={hostLiveItemAuctionBusy}
      onStartAuction={() => void handleHostStartLiveItemAuction()}
      onBeginTeamBreak={() => void handleBeginTeamBreak()}
      teamBreakBusy={teamBreakBusy}
      onEndAuction={handleHostEndAuction}
      onNextItem={handleHostNextItem}
      hostBusy={busy}
      hostClockSkewMs={hostClockSkewMs}
      energyLevel={roomEnergy.level}
      motionBurst={stageMotionBurst}
      lotTransitionPhase={lotTransitionPhase}
    />
  );

  const hostMobileItemOverlay = (
    <VaultPinnedLot
      variant="mobile"
      vaultMode={vaultMode}
      overlayQueueRow={overlayQueueRow}
      activeBoardRow={activeBoardRow}
      roomStatusLive={room.status === "live"}
      viewerCount={room.viewerCount}
      hostAuctionCountdownLabel={hostAuctionCountdownLabel}
      biddingWindowOpen={biddingWindowStillRunningHost}
      hostAuctionDurationSec={hostAuctionDurationSec}
      onHostAuctionDurationSec={setHostAuctionDurationSec}
      hostClutchTimeEnabled={hostClutchTimeEnabled}
      onToggleClutch={() => setHostClutchTimeEnabled((v) => !v)}
      hostStartLiveAuctionEnabled={hostStartLiveAuctionEnabled}
      hostLiveItemAuctionBusy={hostLiveItemAuctionBusy}
      onStartAuction={() => void handleHostStartLiveItemAuction()}
      hostClockSkewMs={hostClockSkewMs}
    />
  );

  const vaultControlsPill = (
    <div className="flex items-center gap-1.5">
      <LiveRoomEnergyMeter score={roomEnergy.score} level={roomEnergy.level} compact />
      <button
        type="button"
        onClick={() => setVaultCommandOpen(true)}
        className="inline-flex max-w-[9rem] items-center gap-1 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-yellow-500/10 px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.12em] text-amber-50 shadow-[0_0_22px_-10px_rgba(245,158,11,0.55)] backdrop-blur-md max-[360px]:max-w-[7.5rem] max-[360px]:gap-0.5 max-[360px]:px-1.5 max-[360px]:text-[7px] max-[360px]:tracking-[0.08em] min-[1400px]:hidden"
      >
        <span className="inline-flex size-1.5 shrink-0 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)] motion-safe:animate-pulse" aria-hidden />
        <span className="truncate">Vault controls</span>
      </button>
    </div>
  );

  const hostLiveChatPanel = (
    <VaultHostLiveChatPanel
      liveRoomId={roomId}
      hostUserId={room.sellerId}
      messages={data.messages}
      systemMsg={systemMsg}
      onSystemMsgChange={setSystemMsg}
      onSendSystem={() => void sendSystem()}
      busy={busy}
      viewerCount={room.viewerCount}
      onMessagesRefresh={() => void mergeHostMessagesFromApi()}
      variant="sidebar"
      uiDimmed={false}
    />
  );

  const hostLiveChatPanelMobile = (
    <VaultHostLiveChatPanel
      liveRoomId={roomId}
      hostUserId={room.sellerId}
      messages={data.messages}
      systemMsg={systemMsg}
      onSystemMsgChange={setSystemMsg}
      onSendSystem={() => void sendSystem()}
      busy={busy}
      onMessagesRefresh={() => void mergeHostMessagesFromApi()}
      variant="overlay"
    />
  );

  const hostMobileChatOverlay = (
    <div className="flex h-[min(44vh,20rem)] max-h-[min(52dvh,24rem)] min-h-0 w-full min-w-0 flex-col max-[380px]:h-[min(36vh,16rem)]">
      {hostLiveChatPanelMobile}
    </div>
  );

  const hostStageProps = {
    layout: "fillHeight" as const,
    overlayMessage: stageOverlayMessage,
    viewers: room.viewerCount,
    hostName: `@${hostUsername}`,
    streamTitle,
    isLive: roomStatusKey === "live",
    roomStatus: room.status as LiveRoomStatus,
    liveRoomId: roomId,
    streamPlaybackRefreshNonce,
    scheduledStartAt: room.scheduledStartAt ?? null,
    thumbnailUrl: room.thumbnailUrl ?? null,
    hostSellerId: room.sellerId,
    onBack: () => router.push("/seller/live"),
    stageBelowAudience: (
      <TeamBoardChromeButton
        league={teamBoardData?.state.league ?? "nba"}
        tileCount={teamBoardData?.teams.length}
        boardVisible={Boolean(teamBoardData?.state.visible)}
        disabled={teamBoardBusy || room.status === "ended"}
        onPress={() => void patchTeamBoard({ visible: !(teamBoardData?.state.visible ?? false) })}
      />
    ),
    centerOverlay: teamBoardStageOverlay,
    actionOverlay: hostDesktopItemOverlay,
    mobileActionOverlay: hostMobileItemOverlay,
    compactActionOverlay: false,
    cinematicActionOverlay: false,
    ambientBleed: true,
    stageEnergyScore: roomEnergy.score,
    vaultMode,
    vaultEnergyLevel: roomEnergy.level,
    uiDimmed: false,
    stageOverlay: (
      <>
        <LiveLotTransitionBanner
          phase={lotTransitionPhase}
          winnerUsername={lotTransitionWinner}
          soldAmount={lotTransitionAmount}
          nextItemTitle={lotTransitionNextTitle}
        />
        {overlayQueueRow && isVariantSalesFormat(overlayQueueRow.item.salesFormat) ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] hidden justify-center px-4 min-[1400px]:flex">
            <LiveVariantSpotBoard item={overlayQueueRow.item} pinned />
          </div>
        ) : null}
      </>
    ),
    chatOverlay: hostMobileChatOverlay,
    chatOverlayClassName: "min-[1400px]:hidden",
    stageEdgeRail: (
      <VaultHostStageEdgeRail
        roomId={roomId}
        disabled={busy}
        muted={streamPreviewMuted}
        onToggleMute={toggleStreamPreviewMute}
        onShare={() => void copyPublic()}
        onOpenCommandCenter={() => setVaultCommandOpen(true)}
        onOpenObs={() => setObsSetupModalOpen(true)}
      />
    ),
    sellerHostRail: (
      <VaultHostRightRail
        roomId={roomId}
        onOpenCommandCenter={() => setVaultCommandOpen(true)}
        onOpenObs={() => setObsSetupModalOpen(true)}
        disabled={busy}
      />
    ),
    hostRailClassName: "min-[1400px]:hidden",
    topChromeTrailing: vaultControlsPill,
  };

  const hostStagePropsMobile = {
    ...hostStageProps,
    layout: "fillHeight" as const,
    stageEdgeRail: undefined,
    compactActionOverlay: false,
  };

  const hostPaymentFailures = data?.sellerUnresolvedPaymentFailures ?? [];

  return (
    <div
      className={`fixed inset-x-0 bottom-0 top-[var(--site-header-offset)] z-40 flex min-h-0 flex-col overflow-hidden bg-black text-sm leading-normal text-zinc-100 ${vaultModeRootClass(vaultMode)}`}
    >
      {hostPaymentFailures.length > 0 ? (
        <div className="pointer-events-none fixed left-1/2 top-[calc(var(--site-header-offset)+0.5rem)] z-[61] w-[min(92vw,28rem)] -translate-x-1/2 px-2">
          <div className="pointer-events-auto rounded-2xl border border-rose-500/35 bg-rose-950/70 px-3 py-2 text-[11px] leading-snug text-rose-50 shadow-lg backdrop-blur-xl ring-1 ring-rose-400/25">
            <p className="font-bold uppercase tracking-wide text-rose-200">Payment failed</p>
            {hostPaymentFailures.slice(0, 3).map((f) => (
              <p key={f.id} className="mt-1">
                @{f.buyerUsername?.replace(/^@/, "") ?? "buyer"} · {fmtHostSpotUsd(f.amountUsd)}
                {f.itemTitle ? ` · ${f.itemTitle}` : ""}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {(toast || hostNotice || refreshWarning) ? (
        <div className={`pointer-events-none fixed left-1/2 ${hostPaymentFailures.length > 0 ? "top-[calc(var(--site-header-offset)+5.5rem)]" : "top-[calc(var(--site-header-offset)+0.5rem)]"} z-[62] w-[min(92vw,26rem)] -translate-x-1/2 px-2`}>
          <div className="pointer-events-auto space-y-2">
            {refreshWarning ? (
              <p
                role="status"
                className="break-words rounded-2xl border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-[11px] leading-snug text-rose-50 shadow-[0_16px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl whitespace-pre-wrap ring-1 ring-rose-400/20"
              >
                {refreshWarning}
              </p>
            ) : null}
            {toast ? (
              <p
                role="alert"
                className="break-words rounded-2xl border border-amber-500/25 bg-amber-950/55 px-3 py-2 text-[11px] leading-snug text-amber-50 shadow-[0_16px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl whitespace-pre-wrap ring-1 ring-amber-400/20"
              >
                {toast}
              </p>
            ) : hostNotice ? (
              <p
                role="status"
                className="rounded-2xl border border-emerald-500/25 bg-emerald-950/45 px-3 py-2 text-[11px] leading-snug text-emerald-50 shadow-[0_16px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl ring-1 ring-emerald-400/20"
              >
                {hostNotice}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col p-1 sm:p-1.5 min-[1400px]:p-0">
        {/* Desktop — full-bleed cinematic stage with floating glass rails */}
        <div className="relative hidden min-h-0 flex-1 overflow-hidden min-[1400px]:block">
          <div className="absolute inset-0 min-h-0">
            <LiveVideoStage {...hostStageProps} />
          </div>

          <aside className="live-stage-utility-dock-wrap pointer-events-auto absolute left-4 top-4 z-30 w-[min(196px,14vw)] live-stage-ui-awake">
            <LiveSellerCommandCenter {...commandCenterProps} variant="panel" compactRail />
          </aside>

          <aside className="live-stage-chat-dock pointer-events-auto absolute bottom-20 right-4 top-4 z-30 flex min-h-0 w-[min(240px,17vw)] min-w-0 flex-col overflow-hidden live-stage-ui-awake">
            {hostLiveChatPanel}
          </aside>

          <VaultQueueDrawer
            open={queueDrawerOpen}
            onClose={() => setQueueDrawerOpen(false)}
            tab={hostQueueTab}
            onTab={setHostQueueTab}
            rows={data.queueItems}
            selectedId={selectedQueueItemId}
            onSelect={setSelectedQueueItemId}
            viewerCount={room.viewerCount}
            busy={busy}
            onPost={(id) => void patchItem(id, "active")}
            onSkip={(id) => void patchItem(id, "skipped")}
            onDelete={(id) => void deleteQueueItem(id)}
            onAddAuction={() => {
              setQueueDrawerOpen(false);
              setQueueAddModal("auction");
            }}
          />
        </div>

        {/* Mobile — full-width stage + floating chat */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] min-[1400px]:hidden">
          <VaultHostAnnouncements variant="mobileOverlay" />
          <div className="relative min-h-0 flex-1">
            <LiveVideoStage {...hostStagePropsMobile} />
          </div>
        </div>
      </div>

      {vaultCommandOpen ? (
        <div className="fixed inset-0 z-[65] min-[1400px]:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setVaultCommandOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 top-[var(--site-header-offset)] overflow-hidden rounded-t-2xl border border-white/10 shadow-2xl">
            <LiveSellerCommandCenter
              {...commandCenterProps}
              variant="overlay"
              onClose={() => setVaultCommandOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <LiveAuctionSoldCelebration celebration={soldCelebration} onDone={() => setSoldCelebration(null)} />

      {obsSetupModalOpen ? (
        <div
          role="dialog"
          aria-modal
          aria-label="OBS stream setup"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={() => setObsSetupModalOpen(false)}
        >
          <div
            className="max-h-[min(92dvh,900px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setObsSetupModalOpen(false)}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
              >
                Close
              </button>
            </div>
            <HostStreamSetupCard roomId={roomId} compact realtimeRefreshNonce={hostStreamCardRefreshNonce} />
          </div>
        </div>
      ) : null}

      <AddQueueItemModal
        open={queueAddModal != null}
        mode={queueAddModal}
        teamBoardLeague={data.room.teamBoardLeague}
        busy={busy}
        onRequestClose={handleQueueAddModalClose}
        onSubmitAuction={handleSubmitAuctionAdd}
      />
    </div>
  );
}
