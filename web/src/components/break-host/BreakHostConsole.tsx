"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LiveAuctionChat } from "@/components/live-auction/LiveAuctionChat";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { TeamBoardChromeButton } from "@/components/team-board/TeamBoardChromeButton";
import { TeamBoardOverlay } from "@/components/team-board/TeamBoardOverlay";
import { HostRecentSalesTile } from "@/components/break-host/HostRecentSalesTile";
import { HostStreamSetupCard } from "@/components/live-auction/HostStreamSetupCard";
import { useRealtimeRoomSubscription } from "@/hooks/useRealtimeRoomSubscription";
import { logLiveDebugEvent } from "@/lib/live-debug";
import {
  createLiveRoomItem,
  deleteLiveRoomItem,
  patchLiveRoomAction,
  patchLiveRoomItemStatus,
  sendLiveRoomSystemMessage,
  startLiveRoomItemAuction,
} from "@/lib/live-room-control-client";
import { appendLiveRoomMessageDedupe, mergeLiveRoomMessagesById } from "@/lib/realtime-merge-messages";
import type { LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import {
  mergeLiveRoomItemsForActiveItemEvent,
  mergeLiveRoomItemsForBidPlaced,
} from "@/lib/live-room-realtime-merge";
import { estimateClockSkewMs, syncedWallTimeMs } from "@/lib/server-clock-sync";
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
};

function fmtHostSpotUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "$—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtHostQueueMoney(item: Pick<QueueRow["item"], "priceUsd" | "startingBidUsd" | "currentBidUsd">) {
  return fmtHostSpotUsd(item.priceUsd ?? item.startingBidUsd ?? item.currentBidUsd);
}

/** Large overlay number: prefer live high bid when present, else spot / starting (priceUsd is often null on auction-only lots). */
function fmtHostOverlayLeadMoney(item: Pick<QueueRow["item"], "priceUsd" | "startingBidUsd" | "currentBidUsd">) {
  const cur = item.currentBidUsd;
  if (cur != null && Number.isFinite(cur)) return fmtHostSpotUsd(cur);
  return fmtHostQueueMoney(item);
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

function hostQueueTitleLine(title: string, quantity: number) {
  const q = typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  if (q <= 1) return title;
  return `${title} · ×${q}`;
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

const HOST_LAYOUT_SESSION_KEY = "gv_host_layout";

/** Lets you force layout while debugging: `?hostLayout=stacked` | `?hostLayout=desktop`, or `sessionStorage.setItem("gv_host_layout","stacked"|"desktop")`. */
function readHostLayoutOverride(): "stacked" | "desktop" | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("hostLayout");
    if (q === "stacked" || q === "touch") return "stacked";
    if (q === "desktop" || q === "wide") return "desktop";
    const s = sessionStorage.getItem(HOST_LAYOUT_SESSION_KEY);
    if (s === "stacked") return "stacked";
    if (s === "desktop") return "desktop";
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Stacked “video → queue → chat” host chrome for real tablets (esp. iPadOS, which often looks like desktop Safari).
 * PCs: false. Uses shape + touch heuristics so we are not tied to a single UA string.
 */
function computeHostTouchStackLayout(): { stacked: boolean; narrow: boolean } {
  if (typeof window === "undefined") return { stacked: false, narrow: false };

  const override = readHostLayoutOverride();
  if (override === "desktop") return { stacked: false, narrow: false };
  if (override === "stacked") {
    const narrow = window.innerWidth < 1024;
    return { stacked: true, narrow };
  }

  const ua = navigator.userAgent;
  const maxTouch = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  const platform = typeof navigator.platform === "string" ? navigator.platform : "";

  const explicitIpad =
    /\biPad\b/i.test(ua) || (platform === "MacIntel" && maxTouch > 1) || /\bTablet\b/i.test(ua);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);

  const hasTouch = maxTouch > 0 || "ontouchstart" in window;
  const notPhone = minDim >= 600;
  const touchTabletSized =
    hasTouch &&
    notPhone &&
    minDim >= 700 &&
    minDim <= 1100 &&
    maxDim >= 1000 &&
    maxDim <= 1650;

  const stacked = explicitIpad || touchTabletSized;
  const narrow = stacked && w < 1024;
  return { stacked, narrow };
}

function hostVideoOverlayWinnerAside(row: QueueRow | null, spotPrice: string) {
  if (!row) {
    return (
      <>
        <p className="text-sm font-semibold text-zinc-400">—</p>
        <span className="font-mono text-base font-black text-zinc-50 drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">{spotPrice}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Lot</span>
      </>
    );
  }
  const st = row.item.status.toLowerCase();
  const claim = row.claim;
  const claims = row.claims;
  const claimTail = claims.length > 1 ? ` +${claims.length - 1}` : "";
  const price = (
    <span className="font-mono text-base font-black text-zinc-50 drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">{spotPrice}</span>
  );
  if (st === "sold") {
    if (claim) {
      return (
        <>
          <p className="text-sm font-semibold text-zinc-200">
            @{claim.user.username}
            {claimTail}
            <span className="text-emerald-300/95"> won</span>
          </p>
          {price}
          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Winner</span>
        </>
      );
    }
    return (
      <>
        <p className="text-sm font-semibold text-zinc-400">Sold</p>
        {price}
        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">No buyer linked</span>
      </>
    );
  }
  if (st === "active") {
    if (claim) {
      return (
        <>
          <p className="text-sm font-semibold text-zinc-200">
            @{claim.user.username}
            {claims.length > 1 ? (
              <span className="text-emerald-300/75">{` · ${claims.length} spots`}</span>
            ) : (
              <>
                {" "}
                <span className="text-emerald-300/75">is winning</span>
              </>
            )}
          </p>
          {price}
          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Winning bidder</span>
        </>
      );
    }
    const highName = row.item.lastHighBidderUsername?.trim();
    if (highName) {
      return (
        <>
          <p className="text-sm font-semibold text-zinc-200">
            @{highName}
            <span className="text-emerald-300/75"> is winning</span>
          </p>
          {price}
          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Winning bidder</span>
        </>
      );
    }
    return (
      <>
        <p className="text-sm font-semibold text-zinc-400">No bidder yet</p>
        {price}
        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Active lot</span>
      </>
    );
  }
  if (claim) {
    return (
      <>
        <p className="text-sm font-semibold text-zinc-200">
          @{claim.user.username}
          {claimTail}
          <span className="font-normal text-zinc-500"> · {st}</span>
        </p>
        {price}
        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Claim</span>
      </>
    );
  }
  return (
    <>
      <p className="text-sm font-semibold text-zinc-400">Open spot</p>
      {price}
      <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Lot</span>
    </>
  );
}

export function BreakHostConsole({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<HostPayload | null>(null);
  const hostDataRef = useRef<HostPayload | null>(null);
  hostDataRef.current = data;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Short-lived buyer/room activity hint (does not replace error `toast`). */
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const hostNoticeTimerRef = useRef<number | null>(null);
  const lastBreakSpotNoticeAtRef = useRef(0);

  const [systemMsg, setSystemMsg] = useState("");

  const [queueAddModal, setQueueAddModal] = useState<null | "auction" | "bin" | "givvy">(null);
  const [obsSetupModalOpen, setObsSetupModalOpen] = useState(false);
  /** Touch-tablet / iPad stacked host chrome (video → queue → chat). See `computeHostTouchStackLayout`. */
  const [ipadHostStacked, setIpadHostStacked] = useState(false);
  /** Narrow width on that layout (e.g. portrait): tighter stage + panel caps. */
  const [ipadHostNarrow, setIpadHostNarrow] = useState(false);
  const [auctionDraftTitle, setAuctionDraftTitle] = useState("");
  const [auctionDraftPrice, setAuctionDraftPrice] = useState("");
  const [auctionDraftQuantity, setAuctionDraftQuantity] = useState("1");
  const [auctionDraftStartBid, setAuctionDraftStartBid] = useState("");
  const [queueDraftMisc, setQueueDraftMisc] = useState(false);

  const [teamBoardData, setTeamBoardData] = useState<TeamBoardPublicPayload | null>(null);
  const [teamBoardBusy, setTeamBoardBusy] = useState(false);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState("");
  const [hostAuctionDurationSec, setHostAuctionDurationSec] = useState(5);
  const [hostClutchTimeEnabled, setHostClutchTimeEnabled] = useState(false);
  const [hostLiveItemAuctionBusy, setHostLiveItemAuctionBusy] = useState(false);
  const [auctionTickHost, setAuctionTickHost] = useState(0);
  const [hostClockSkewMs, setHostClockSkewMs] = useState(0);
  const [hostQueueTab, setHostQueueTab] = useState<"auction" | "bin" | "givvy">("auction");
  const [hostMobilePanel, setHostMobilePanel] = useState<"controls" | "queue" | "chat" | "sales" | "more" | null>(null);
  const lastRefreshAtRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);
  const fallbackRefreshTimerRef = useRef<number | null>(null);
  const lastRoomVersionRef = useRef(0);
  const lastItemVersionRef = useRef<Record<string, number>>({});
  const lastEventAtByTypeRef = useRef<Record<string, number>>({});
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const [streamPlaybackRefreshNonce, setStreamPlaybackRefreshNonce] = useState(0);
  const [hostStreamCardRefreshNonce, setHostStreamCardRefreshNonce] = useState(0);

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
          const j = JSON.parse(raw) as { error?: string };
          if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
        } catch {
          /* ignore */
        }
        if (res.status === 403 && msg.includes("only for break")) {
          msg = "Host console is only for break rooms. Open the public room page instead.";
        }
        if (res.status === 404) {
          msg = "Host console: room not found. Check the URL or DATABASE_URL.";
        }
        setLoadError(msg);
        setData(null);
        hostConsoleHydratedRef.current = false;
        return;
      }
      setLoadError(null);
      const j = (await res.json()) as HostPayload & { serverNowMs?: number };
      if (typeof j.serverNowMs === "number") {
        setHostClockSkewMs(estimateClockSkewMs(t0, t1, j.serverNowMs));
      }
      if (!j?.room || typeof j.room.status !== "string") {
        setLoadError("Could not load host console (invalid room data).");
        setData(null);
        hostConsoleHydratedRef.current = false;
        return;
      }
      setData((prev) => {
        if (!prev) return { ...j, recentSales: j.recentSales ?? [] };
        return {
          ...j,
          recentSales: j.recentSales ?? prev.recentSales ?? [],
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
        setToast("Could not refresh the queue. Reload the page or try again in a moment.");
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
    if (!activeBoardRow) return;
    setHostLiveItemAuctionBusy(true);
    setToast(null);
    let success = false;
    try {
      const res = await startLiveRoomItemAuction(roomId, activeBoardRow.item.id, hostAuctionDurationSec, hostClutchTimeEnabled);
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
      const aid = activeBoardRow.item.id;
      const base =
        d.item && typeof d.item === "object" && typeof (d.item as LiveRoomItemDTO).id === "string"
          ? (d.item as LiveRoomItemDTO)
          : activeBoardRow.item;
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
  }, [activeBoardRow, hostAuctionDurationSec, hostClutchTimeEnabled, load, roomId, router]);

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

  useEffect(
    () => () => {
      if (hostNoticeTimerRef.current != null) window.clearTimeout(hostNoticeTimerRef.current);
    },
    [],
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

  const chatPollLive = data?.room?.status?.toLowerCase() === "live";
  useEffect(() => {
    if (!chatPollLive) return;
    if (getSupabaseBrowserClient()) return;
    const id = window.setInterval(() => void mergeHostMessagesFromApi(), 2500);
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
      flashHostNotice("Item sold · syncing");
      scheduleFallbackRefresh("purchase_completed", 40);
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
    onConnectionStateChange: ({ status, reconnectCount }) =>
      logLiveDebugEvent({
        event: "realtime_connection_state",
        roomId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { status, reconnectCount, surface: "host_console" },
      }),
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
        await load();
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

  const onHostMessagesChange = useCallback(
    (next: LiveRoomMessageDTO[] | ((prev: LiveRoomMessageDTO[]) => LiveRoomMessageDTO[])) => {
      setData((prev) => {
        if (!prev) return prev;
        const resolved = typeof next === "function" ? next(prev.messages) : next;
        return { ...prev, messages: resolved };
      });
    },
    [],
  );

  const submitAuctionAdd = () => {
    const title = auctionDraftTitle.trim();
    if (!title) {
      setToast("Title required.");
      return;
    }
    const p = auctionDraftPrice.trim() === "" ? null : Number(auctionDraftPrice);
    const qtyRaw = auctionDraftQuantity.trim() === "" ? 1 : Number(auctionDraftQuantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
    const sbRaw = auctionDraftStartBid.trim();
    const startingBidUsd =
      sbRaw === ""
        ? 1
        : Number.isFinite(Number(sbRaw)) && Number(sbRaw) > 0
          ? Number(sbRaw)
          : 1;
    const miscPayload =
      hostDataRef.current?.room.teamBoardLeague === "nfl" ? { teamBoardMisc: queueDraftMisc } : {};
    return void (async () => {
      setBusy(true);
      setToast(null);
      try {
        const res = await createLiveRoomItem(roomId, {
          title,
          priceUsd: p != null && Number.isFinite(p) ? p : null,
          startingBidUsd,
          quantity,
          ...miscPayload,
        });
        if (!res.ok) {
          setToast(res.issues.length ? `${res.error}\n\n${res.issues.join("\n")}` : res.error);
          return;
        }
        setQueueAddModal(null);
        setAuctionDraftTitle("");
        setAuctionDraftPrice("");
        setAuctionDraftQuantity("1");
        setAuctionDraftStartBid("");
        setQueueDraftMisc(false);
        await load();
        router.refresh();
        setToast("Added to queue.");
      } catch (err) {
        const msg = err instanceof Error ? err.message.trim() : "";
        setToast(msg ? `Could not add item (${msg}).` : "Could not add item. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    })();
  };

  const copyPublic = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setToast("Public link copied.");
    } catch {
      setToast("Could not copy link.");
    }
  };

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

  useLayoutEffect(() => {
    const sync = () => {
      const { stacked, narrow } = computeHostTouchStackLayout();
      setIpadHostStacked(stacked);
      setIpadHostNarrow(narrow);
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
    }
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      if (vv) {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
      }
    };
  }, []);

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
  const spotPriceDisplay = overlayQueueRow ? fmtHostOverlayLeadMoney(overlayQueueRow.item) : fmtHostSpotUsd(null);

  const biddingWindowStillRunningHost = Boolean(
    activeBoardRow?.item.biddingOpen &&
      activeBoardRow.item.auctionEndsAt &&
      Number.isFinite(Date.parse(activeBoardRow.item.auctionEndsAt)) &&
      Date.parse(activeBoardRow.item.auctionEndsAt) > syncedWallTimeMs(hostClockSkewMs),
  );
  void auctionTickHost;
  const hostAuctionCountdownLabel =
    activeBoardRow?.item.biddingOpen && activeBoardRow.item.auctionEndsAt
      ? (() => {
          const ends = Date.parse(activeBoardRow.item.auctionEndsAt!);
          if (!Number.isFinite(ends)) return null;
          return formatHostAuctionCountdownMs(ends - syncedWallTimeMs(hostClockSkewMs));
        })()
      : null;
  const hostStartLiveAuctionEnabled =
    room.status === "live" && Boolean(activeBoardRow) && !biddingWindowStillRunningHost;

  const hostDesktopItemOverlay = (
    <div className="rounded-xl border border-violet-300/30 bg-black/72 px-3.5 py-2.5 backdrop-blur-[var(--live-blur-lg)] shadow-[0_0_28px_-12px_rgba(167,139,250,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="inline-flex size-12 shrink-0 items-center justify-center rounded-md border border-white/15 bg-zinc-900/90 text-sm font-black text-zinc-200">
              {overlayQueueRow ? (overlayQueueRow.item.title?.slice(0, 2).toUpperCase() ?? "IT") : "—"}
            </div>
            <p className="line-clamp-2 text-sm font-semibold text-zinc-200">
              {overlayQueueRow ? (
                <>
                  {hostQueueTitleLine(overlayQueueRow.item.title, overlayQueueRow.item.quantity)}
                  <span className="text-zinc-500"> · #{overlayQueueRow.item.sortOrder}</span>
                </>
              ) : (
                "No queue items yet"
              )}
            </p>
          </div>
          <p className="min-w-0 text-left text-[10px] font-semibold leading-snug text-zinc-400">
            {overlayQueueRow ? (
              <>
                <span className="uppercase">{overlayQueueRow.item.status}</span>
                {overlayQueueRow.claim ? (
                  <span>{` · @${overlayQueueRow.claim.user.username}${
                    overlayQueueRow.claims.length > 1 ? ` +${overlayQueueRow.claims.length - 1}` : ""
                  }`}</span>
                ) : overlayQueueRow.item.status.toLowerCase() === "active" &&
                  overlayQueueRow.item.lastHighBidderUsername?.trim() ? (
                  <span>{` · @${overlayQueueRow.item.lastHighBidderUsername.trim()} winning`}</span>
                ) : (
                  <span> · Available</span>
                )}
                {overlayQueueRow.item.status.toLowerCase() === "active" &&
                overlayQueueRow.item.currentBidUsd != null &&
                Number.isFinite(overlayQueueRow.item.currentBidUsd) ? (
                  <span className="text-emerald-200/90">{` · High ${fmtHostSpotUsd(overlayQueueRow.item.currentBidUsd)}`}</span>
                ) : null}
              </>
            ) : (
              "Add pulls in the sidebar queue."
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {hostVideoOverlayWinnerAside(overlayQueueRow, spotPriceDisplay)}
        </div>
      </div>
      {activeBoardRow ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
          {biddingWindowStillRunningHost && hostAuctionCountdownLabel ? (
            <p className="text-[11px] font-black tabular-nums text-emerald-200">Time left {hostAuctionCountdownLabel}</p>
          ) : null}
          {room.status === "live" ? (
            biddingWindowStillRunningHost ? null : (
              <>
                <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                  <span className="font-semibold uppercase tracking-wide">Timer</span>
                  <select
                    value={hostAuctionDurationSec}
                    onChange={(e) => setHostAuctionDurationSec(Number(e.target.value))}
                    className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-semibold text-zinc-100"
                  >
                    {HOST_AUCTION_DURATION_CHOICES.map((c) => (
                      <option key={c.sec} value={c.sec}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={hostClutchTimeEnabled}
                  onClick={() => setHostClutchTimeEnabled((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                    hostClutchTimeEnabled
                      ? "border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-amber-400/25 text-white shadow-[0_0_18px_-8px_rgba(217,70,239,0.9)]"
                      : "border-white/20 bg-black/45 text-zinc-300 hover:border-white/35 hover:text-zinc-100"
                  }`}
                >
                  <span
                    className={`relative inline-flex h-4 w-7 items-center rounded-full border ${
                      hostClutchTimeEnabled ? "border-fuchsia-200/70 bg-fuchsia-400/30" : "border-white/25 bg-black/50"
                    }`}
                  >
                    <span
                      className={`absolute h-3 w-3 rounded-full bg-white transition ${
                        hostClutchTimeEnabled ? "left-[14px]" : "left-[1px]"
                      }`}
                    />
                  </span>
                  <span>Clutch Time</span>
                </button>
                <button
                  type="button"
                  disabled={!hostStartLiveAuctionEnabled || hostLiveItemAuctionBusy}
                  onClick={() => void handleHostStartLiveItemAuction()}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {hostLiveItemAuctionBusy ? "Starting…" : "Start"}
                </button>
              </>
            )
          ) : (
            <p className="text-[10px] text-amber-200/90">Go live on stream to open timed bidding.</p>
          )}
        </div>
      ) : null}
    </div>
  );

  const hostMobileItemOverlay = (
    <div className="live-glass-sheet live-glass-sheet-host relative px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 max-[380px]:px-2 max-[380px]:pt-2">
      <div className="flex items-start gap-2 max-[380px]:gap-1.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--live-border)] bg-zinc-900/90 text-[11px] font-black text-zinc-200 max-[380px]:size-9 max-[380px]:text-[10px]">
          {overlayQueueRow ? (overlayQueueRow.item.title?.slice(0, 2).toUpperCase() ?? "IT") : "—"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-left text-[11px] font-semibold leading-snug text-zinc-100 max-[380px]:text-[10px]">
            {overlayQueueRow ? (
              <>
                <span className="text-zinc-500">#{overlayQueueRow.item.sortOrder}</span> ·{" "}
                {hostQueueTitleLine(overlayQueueRow.item.title, overlayQueueRow.item.quantity)}
              </>
            ) : (
              "No queue items"
            )}
          </p>
          <p className="mt-1 text-left text-[10px] font-semibold text-zinc-400 max-[380px]:text-[9px]">
            {overlayQueueRow ? (
              (() => {
                const st = overlayQueueRow.item.status.toLowerCase();
                const c = overlayQueueRow.claim;
                const bid =
                  overlayQueueRow.item.currentBidUsd != null && Number.isFinite(overlayQueueRow.item.currentBidUsd)
                    ? fmtHostSpotUsd(overlayQueueRow.item.currentBidUsd)
                    : null;
                if (st === "sold" && c) return <>Sold · @{c.user.username}{bid ? ` · ${bid}` : ""}</>;
                if (st === "active" && c) return <>Live · @{c.user.username} winning{bid ? ` · ${bid}` : ""}</>;
                if (st === "active") {
                  const hb = overlayQueueRow.item.lastHighBidderUsername?.trim();
                  if (hb) return <>Live · @{hb} winning{bid ? ` · ${bid}` : ""}</>;
                  return <>{bid ? <>Live · high bid {bid}</> : "Live · no bidder yet"}</>;
                }
                return (
                  <>
                    <span className="uppercase">{selectedQueueRow.item.status}</span>
                    {c ? ` · @${c.user.username}` : " · Available"}
                    {bid ? ` · ${bid}` : ""}
                  </>
                );
              })()
            ) : (
              "Open Queue to add lots"
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Spot</p>
          <p className="font-mono text-sm font-black tabular-nums text-violet-100 max-[380px]:text-[13px]">{spotPriceDisplay}</p>
        </div>
      </div>
      {activeBoardRow ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
          {biddingWindowStillRunningHost && hostAuctionCountdownLabel ? (
            <p className="text-center text-[10px] font-black tabular-nums text-emerald-200">Time left {hostAuctionCountdownLabel}</p>
          ) : null}
          {room.status === "live" ? (
            biddingWindowStillRunningHost ? null : (
              <>
                <label className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                  <span className="font-bold uppercase tracking-wide">Timer</span>
                  <select
                    value={hostAuctionDurationSec}
                    onChange={(e) => setHostAuctionDurationSec(Number(e.target.value))}
                    className="rounded-full border border-[color:var(--live-border)] bg-black/50 px-2 py-1 text-[10px] font-semibold text-zinc-100"
                  >
                    {HOST_AUCTION_DURATION_CHOICES.map((c) => (
                      <option key={c.sec} value={c.sec}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={hostClutchTimeEnabled}
                  onClick={() => setHostClutchTimeEnabled((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition ${
                    hostClutchTimeEnabled
                      ? "border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-amber-400/25 text-white"
                      : "border-white/20 bg-black/45 text-zinc-300"
                  }`}
                >
                  <span
                    className={`relative inline-flex h-3.5 w-6 items-center rounded-full border ${
                      hostClutchTimeEnabled ? "border-fuchsia-200/70 bg-fuchsia-400/30" : "border-white/25 bg-black/50"
                    }`}
                  >
                    <span
                      className={`absolute h-2.5 w-2.5 rounded-full bg-white transition ${
                        hostClutchTimeEnabled ? "left-[11px]" : "left-[1px]"
                      }`}
                    />
                  </span>
                  <span>Clutch Time</span>
                </button>
                <button
                  type="button"
                  disabled={!hostStartLiveAuctionEnabled || hostLiveItemAuctionBusy}
                  onClick={() => void handleHostStartLiveItemAuction()}
                  className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
                >
                  {hostLiveItemAuctionBusy ? "…" : "Start"}
                </button>
              </>
            )
          ) : (
            <p className="text-center text-[9px] text-amber-200/90">Go live to open bidding.</p>
          )}
        </div>
      ) : null}
    </div>
  );

  const selectableHostQueue = data.queueItems.filter(
    ({ item }) => item.status !== "sold" && item.status !== "skipped",
  );
  const hostQueueListRows = selectableHostQueue.length > 0 ? selectableHostQueue : data.queueItems;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--site-header-offset)] z-40 flex min-h-0 flex-col overflow-hidden bg-black text-sm leading-normal text-zinc-100">
      <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-800 bg-zinc-950/95 px-2 py-1.5 backdrop-blur-md sm:px-3 sm:py-2 lg:px-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 sm:gap-x-3">
            <div className="min-w-0 max-w-full flex-1 basis-[min(100%,18rem)] sm:basis-0">
              <p className="text-[9px] font-bold uppercase leading-tight tracking-[0.12em] text-zinc-500 sm:text-[10px] sm:tracking-[0.14em]">
                Break Host Console{" "}
                <Link href="/seller/live" className="font-medium normal-case tracking-normal text-zinc-500 hover:text-zinc-300">
                  · Seller live
                </Link>
              </p>
              <h1
                className="line-clamp-1 font-display text-sm font-bold leading-tight tracking-tight text-zinc-50 sm:text-[0.9375rem] lg:text-base"
                title={room.breakDisplayTitle || room.title}
              >
                {room.breakDisplayTitle || room.title}
              </h1>
            </div>
            <div
              className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1 sm:w-auto sm:max-w-[min(100%,52rem)] sm:justify-end sm:gap-1.5"
              aria-label="Stream controls"
            >
              {busy ? (
                <span className="text-[10px] text-zinc-500 sm:text-[11px]">Working…</span>
              ) : null}
              {room.status === "live" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchRoom("end")}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-rose-600/90 px-3 text-[10px] font-bold text-white shadow-sm hover:bg-rose-500 disabled:opacity-40 sm:h-8 sm:px-3.5 sm:text-xs"
                >
                  End Stream
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || room.status === "ended"}
                  onClick={() => void patchRoom("start")}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600/90 px-3 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40 sm:h-8 sm:px-3.5 sm:text-xs"
                >
                  Start Stream
                </button>
              )}
              <button
                type="button"
                onClick={() => setObsSetupModalOpen(true)}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/[0.06] px-2.5 text-[10px] font-semibold text-gold-bright hover:bg-gold/10 sm:px-3 sm:text-xs"
              >
                Setup OBS
              </button>
              <span
                className={`inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 px-2.5 font-mono text-[10px] font-semibold tabular-nums tracking-wide sm:px-3 sm:text-xs ${
                  room.status === "live" ? "text-zinc-100" : "text-zinc-500"
                }`}
                title="Time since room went live"
              >
                {streamTimerDisplay}
              </span>
            </div>
          </div>
          {toast ? (
            <p
              role="alert"
              className="break-words rounded-md bg-amber-950/35 px-2 py-1 text-[10px] leading-snug text-amber-100/95 ring-1 ring-amber-500/25 whitespace-pre-wrap sm:px-2.5 sm:text-[11px]"
            >
              {toast}
            </p>
          ) : hostNotice ? (
            <p
              role="status"
              className="rounded-md bg-emerald-950/30 px-2 py-1 text-[10px] leading-snug text-emerald-100/90 ring-1 ring-emerald-500/25 sm:px-2.5 sm:text-[11px]"
            >
              {hostNotice}
            </p>
          ) : null}
        </div>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 pt-1.5 pb-[max(6.5rem,calc(5rem+env(safe-area-inset-bottom)))] max-[819px]:pb-[max(6.5rem,calc(5rem+env(safe-area-inset-bottom)))] min-[820px]:max-lg:pb-3 sm:p-3 sm:pt-2 lg:px-5 lg:pb-6 lg:pt-2 ${ipadHostStacked ? "!pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""}`}
      >
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 lg:gap-6">
          {/*
            Desktop (lg+): three-column row (queue · stream · chat), then full-width Recent sales below.
            Touch tablets: `ipadHostStacked` — video → queue → chat; Recent sales follows in page flow.
            Debug: `?hostLayout=stacked` or `sessionStorage.setItem("gv_host_layout","stacked")`; force PC grid: `?hostLayout=desktop`.
          */}
          <div
            data-ipad-host-stacked={ipadHostStacked ? "true" : "false"}
            data-ipad-host-narrow={ipadHostNarrow ? "true" : "false"}
            className={
              ipadHostStacked
                ? ipadHostNarrow
                  ? "grid min-h-0 grid-cols-1 content-start gap-2.5"
                  : "grid min-h-0 grid-cols-1 content-start gap-3"
                : "grid min-h-0 gap-4 max-[819px]:grid-rows-[auto_auto_auto] lg:h-[calc(100dvh-var(--site-header-offset)-7rem)] lg:min-h-[26rem] lg:grid-cols-[minmax(260px,280px)_minmax(0,1fr)_minmax(300px,320px)] lg:grid-rows-1 lg:items-stretch lg:gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]"
            }
          >
            <aside
              className={
                ipadHostStacked
                  ? ipadHostNarrow
                    ? "host-auction-queue order-2 flex max-h-[min(34dvh,15rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
                    : "host-auction-queue order-2 flex max-h-[min(42dvh,22rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
                  : "host-auction-queue max-lg:hidden flex min-h-[min(320px,46dvh)] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 lg:h-full lg:min-h-0 lg:self-stretch lg:overflow-visible lg:p-4"
              }
            >
              <div className="queue-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/65 p-3 lg:flex-1 lg:min-h-0 lg:overflow-visible lg:p-3.5">
                <div className="mb-2 flex shrink-0 rounded-lg border border-zinc-800 bg-black/45 p-0.5">
                  {(
                    [
                      { id: "auction" as const, label: "Auction" },
                      { id: "bin" as const, label: "BIN" },
                      { id: "givvy" as const, label: "Givvy" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setHostQueueTab(id)}
                      className={`min-w-0 flex-1 rounded-md py-2 text-[10px] font-black uppercase tracking-wide transition ${
                        hostQueueTab === id
                          ? "bg-gold/25 text-gold-bright shadow-sm ring-1 ring-gold/35"
                          : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {hostQueueTab === "auction" ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:overflow-visible">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAuctionDraftTitle("");
                        setAuctionDraftPrice("");
                        setQueueAddModal("auction");
                      }}
                      className="mb-2 w-full shrink-0 rounded-xl bg-gold/20 py-2 text-[11px] font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/25 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gold-bright/90">Auction queue</p>
                      <span className="text-[10px] font-semibold text-zinc-500">
                        {selectableHostQueue.length} queue item{selectableHostQueue.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="queue-list min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 lg:overflow-visible lg:flex-none">
                      {hostQueueListRows.map(({ item, claim, claims }) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                            item.id === selectedQueueItemId
                              ? "border-gold/45 bg-zinc-900 text-zinc-100"
                              : "border-zinc-800 bg-black/50 text-zinc-400"
                          }`}
                        >
                          <button type="button" onClick={() => setSelectedQueueItemId(item.id)} className="w-full text-left">
                            <p className="font-semibold leading-snug">{hostQueueTitleLine(item.title, item.quantity)}</p>
                            <p className="mt-0.5 font-mono text-[10px]">{fmtHostQueueMoney(item)}</p>
                            <p className="mt-0.5 text-[10px] uppercase text-zinc-500">
                              {item.status}
                              {claim ? (
                                <span className="normal-case text-zinc-400">
                                  {" "}
                                  · @{claim.user.username}
                                  {claims.length > 1 ? ` +${claims.length - 1}` : ""}
                                </span>
                              ) : null}
                            </p>
                          </button>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-1.5">
                            {item.status !== "active" && item.status !== "sold" ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-violet-500/35 bg-violet-950/30 px-2 py-0.5 text-[10px] font-bold text-violet-100 hover:bg-violet-950/45"
                                onClick={() => void patchItem(item.id, "active")}
                              >
                                Post
                              </button>
                            ) : null}
                            {item.status !== "sold" ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-rose-500/30 px-2 py-0.5 text-[10px] font-semibold text-rose-200/90 hover:bg-rose-500/10"
                                onClick={() => void deleteQueueItem(item.id)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : hostQueueTab === "bin" ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:overflow-visible">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setQueueAddModal("bin")}
                      className="mb-2 w-full shrink-0 rounded-xl bg-gold/20 py-2 text-[11px] font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/25 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Buy It Now</p>
                    <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-zinc-500">
                      BIN lots and pricing will tie into your show setup. This tab is ready for that queue when the API is wired.
                    </p>
                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed border-zinc-700/80 bg-black/30 p-3 lg:overflow-visible lg:flex-none">
                      <p className="text-center text-[11px] text-zinc-600">No BIN items yet</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:overflow-visible">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setQueueAddModal("givvy")}
                      className="mb-2 w-full shrink-0 rounded-xl bg-gold/20 py-2 text-[11px] font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/25 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Givvy</p>
                    <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-zinc-500">
                      Giveaways and winner draws can live here. Hook this tab to your givvy flow from show creation.
                    </p>
                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed border-zinc-700/80 bg-black/30 p-3 lg:overflow-visible lg:flex-none">
                      <p className="text-center text-[11px] text-zinc-600">No giveaways queued</p>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            <div
              className={
                ipadHostStacked
                  ? "host-video-stage order-1 flex min-h-0 w-full min-w-0 flex-col"
                  : "host-video-stage flex min-h-0 min-w-0 flex-col lg:h-full lg:min-h-0 lg:self-stretch lg:overflow-visible"
              }
            >
              <div
                className={
                  ipadHostStacked
                    ? ipadHostNarrow
                      ? "flex min-h-[min(36dvh,17rem)] flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/75 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                      : "flex min-h-[min(52dvh,min(34rem,58dvh))] flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/75 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                    : "flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/75 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] max-lg:min-h-[min(46dvh,26rem)] lg:h-full lg:min-h-0 lg:flex-1"
                }
              >
                <div className="min-h-0 flex-1 lg:h-full lg:min-h-0">
                  <LiveVideoStage
                  layout="fillHeight"
                  overlayMessage={stageOverlayMessage}
                  viewers={room.viewerCount}
                  hostName={`@${hostUsername}`}
                  streamTitle={streamTitle}
                  isLive={roomStatusKey === "live"}
                  roomStatus={room.status as LiveRoomStatus}
                  liveRoomId={roomId}
                  streamPlaybackRefreshNonce={streamPlaybackRefreshNonce}
                  scheduledStartAt={room.scheduledStartAt ?? null}
                  thumbnailUrl={room.thumbnailUrl ?? null}
                  hostSellerId={room.sellerId}
                  stageBelowAudience={
                    <TeamBoardChromeButton
                      league={teamBoardData?.state.league ?? "nba"}
                      tileCount={teamBoardData?.teams.length}
                      boardVisible={Boolean(teamBoardData?.state.visible)}
                      disabled={teamBoardBusy || room.status === "ended"}
                      onPress={() =>
                        void patchTeamBoard({ visible: !(teamBoardData?.state.visible ?? false) })
                      }
                    />
                  }
                  centerOverlay={teamBoardStageOverlay}
                  actionOverlay={hostDesktopItemOverlay}
                  mobileActionOverlay={hostMobileItemOverlay}
                />
                </div>
              </div>
              <div className="mt-2 hidden max-[819px]:grid grid-cols-3 gap-1.5 max-[380px]:gap-1">
                <button
                  type="button"
                  disabled={busy || room.status === "live"}
                  onClick={() => void patchRoom("start")}
                  className="min-h-11 rounded-[var(--live-radius-chrome)] bg-emerald-600/90 text-[10px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:px-0.5 max-[380px]:text-[9px] disabled:opacity-40"
                >
                  START
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedQueueRow}
                  onClick={() => selectedQueueRow ? void patchItem(selectedQueueRow.item.id, "skipped") : undefined}
                  className="min-h-11 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.06] text-[10px] font-black uppercase tracking-wide text-zinc-200 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:px-0.5 max-[380px]:text-[9px] disabled:opacity-40"
                >
                  PASS
                </button>
                <button
                  type="button"
                  disabled={busy || room.status === "ended"}
                  onClick={() => void patchRoom("end")}
                  className="min-h-11 rounded-[var(--live-radius-chrome)] bg-rose-600/90 text-[10px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:px-0.5 max-[380px]:text-[9px] disabled:opacity-40"
                >
                  END
                </button>
              </div>
            </div>

            <aside
              className={
                ipadHostStacked
                  ? ipadHostNarrow
                    ? "host-room-chat order-3 flex max-h-[min(30dvh,17rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
                    : "host-room-chat order-3 flex max-h-[min(40dvh,24rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
                  : "host-room-chat max-lg:hidden flex min-h-[min(320px,46dvh)] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 lg:h-full lg:min-h-0 lg:self-stretch lg:overflow-visible lg:p-4"
              }
            >
              <div className="chat-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/65 lg:flex-1 lg:min-h-0 lg:overflow-visible lg:p-3.5">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-1 lg:min-h-0 lg:overflow-visible">
                  <LiveAuctionChat
                    embedded
                    scrollMessages={false}
                    liveRoomId={roomId}
                    messages={data.messages}
                    onMessagesChange={onHostMessagesChange}
                  />
                </div>
                <div className="shrink-0 border-t border-zinc-800 bg-black/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">System broadcast</p>
                  <textarea
                    value={systemMsg}
                    onChange={(e) => setSystemMsg(e.target.value)}
                    placeholder="Broadcast to the room…"
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendSystem()}
                    className="mt-2 w-full rounded-lg bg-gold/20 px-4 py-2 text-xs font-bold text-gold-bright hover:bg-gold/25 disabled:opacity-50"
                  >
                    Send system message
                  </button>
                </div>
              </div>
            </aside>
          </div>

          <section aria-label="Recent sales on this show" className="mt-2 w-full min-w-0 shrink-0 lg:mt-6">
            <HostRecentSalesTile rows={data.recentSales ?? []} />
          </section>
        </div>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-[55] border-t border-[color:var(--live-border)] bg-black/82 px-2 pt-2 backdrop-blur-[var(--live-blur-md)] pb-[max(0.35rem,env(safe-area-inset-bottom))] ${ipadHostStacked ? "hidden" : "hidden max-[819px]:block"}`}
      >
        <div className="mx-auto grid max-w-[700px] grid-cols-5 gap-1.5 max-[380px]:gap-1">
          {(
            [
              { id: "controls" as const, label: "Controls" },
              { id: "queue" as const, label: "Queue" },
              { id: "chat" as const, label: "Chat" },
              { id: "sales" as const, label: "Sales" },
              { id: "more" as const, label: "More" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHostMobilePanel(tab.id)}
              className="min-h-11 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.03] px-0.5 py-2 text-[10px] font-black uppercase leading-tight tracking-wide text-zinc-200 transition-[transform,background-color,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:text-[9px] sm:text-[11px]"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <MobileBottomSheet
        open={hostMobilePanel !== null}
        onClose={() => setHostMobilePanel(null)}
        title={
          hostMobilePanel === "controls"
            ? "Live Controls"
            : hostMobilePanel === "queue"
              ? "Queue"
              : hostMobilePanel === "chat"
                ? "Chat"
                : hostMobilePanel === "sales"
                  ? "Sales"
                  : "More"
        }
      >
        {hostMobilePanel === "controls" ? (
          <div className="space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-3 gap-2 max-[380px]:gap-1.5">
              <button
                type="button"
                disabled={busy || room.status === "live"}
                onClick={() => void patchRoom("start")}
                className="min-h-11 rounded-[var(--live-radius-chrome)] bg-emerald-600/90 text-[10px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:text-[9px] disabled:opacity-40"
              >
                START
              </button>
              <button
                type="button"
                disabled={busy || !selectedQueueRow}
                onClick={() => selectedQueueRow ? void patchItem(selectedQueueRow.item.id, "skipped") : undefined}
                className="min-h-11 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-white/[0.06] text-[10px] font-black uppercase tracking-wide text-zinc-200 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:text-[9px] disabled:opacity-40"
              >
                PASS
              </button>
              <button
                type="button"
                disabled={busy || room.status === "ended"}
                onClick={() => void patchRoom("end")}
                className="min-h-11 rounded-[var(--live-radius-chrome)] bg-rose-600/90 text-[10px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 max-[380px]:text-[9px] disabled:opacity-40"
              >
                END
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Tip: <span className="font-semibold text-zinc-400">Post</span> shows the lot on the room (bidding opens when the show is live).{" "}
              <span className="font-semibold text-zinc-400">Delete</span> removes the row.
            </p>
          </div>
        ) : null}
        {hostMobilePanel === "queue" ? (
          <div className="space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAuctionDraftTitle("");
                setAuctionDraftPrice("");
                setQueueAddModal("auction");
              }}
              className="w-full min-h-11 rounded-xl bg-gold/20 py-2.5 text-[12px] font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/25 disabled:opacity-50"
            >
              Add queue lot
            </button>
            {hostQueueListRows.map(({ item, claim, claims }) => (
              <div
                key={item.id}
                className={`rounded-xl border px-2.5 py-2 text-left ${
                  selectedQueueItemId === item.id ? "border-gold/45 bg-zinc-900" : "border-zinc-800 bg-black/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedQueueItemId(item.id)}
                  className="w-full text-left"
                >
                  <p className="text-xs font-semibold leading-snug text-zinc-100">
                    {hostQueueTitleLine(item.title, item.quantity)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-zinc-300">{fmtHostQueueMoney(item)}</p>
                  {item.currentBidUsd != null && Number.isFinite(item.currentBidUsd) ? (
                    <p className="mt-0.5 font-mono text-[11px] text-emerald-200/90">High {fmtHostSpotUsd(item.currentBidUsd)}</p>
                  ) : null}
                  <p className="mt-0.5 text-[10px] uppercase text-zinc-500">
                    {item.status}
                    {claim ? (
                      <span className="normal-case text-zinc-400">
                        {" "}
                        · @{claim.user.username}
                        {claims.length > 1 ? ` +${claims.length - 1}` : ""}
                      </span>
                    ) : null}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-2 border-t border-white/[0.06] pt-2">
                  {item.status !== "active" && item.status !== "sold" ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-10 flex-1 rounded-lg border border-violet-500/35 bg-violet-950/30 text-[10px] font-bold text-violet-100"
                      onClick={() => void patchItem(item.id, "active")}
                    >
                      Post
                    </button>
                  ) : null}
                  {item.status !== "sold" ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-10 flex-1 rounded-lg border border-rose-500/30 text-[10px] font-semibold text-rose-200/90 hover:bg-rose-500/10 disabled:opacity-50"
                      onClick={() => void deleteQueueItem(item.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {hostMobilePanel === "chat" ? (
          <div className="space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <LiveAuctionChat
              embedded
              liveRoomId={roomId}
              messages={data.messages}
              onMessagesChange={onHostMessagesChange}
            />
            <div className="rounded-xl border border-zinc-800 bg-black/35 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">System broadcast</p>
              <textarea
                value={systemMsg}
                onChange={(e) => setSystemMsg(e.target.value)}
                placeholder="Broadcast to the room..."
                rows={3}
                className="mt-1.5 min-h-[5rem] w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendSystem()}
                className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg bg-gold/20 px-4 text-sm font-bold text-gold-bright hover:bg-gold/25 disabled:opacity-50"
              >
                Send system message
              </button>
            </div>
          </div>
        ) : null}
        {hostMobilePanel === "sales" ? (
          <div className="space-y-3 pb-2 text-xs text-zinc-300">
            <HostRecentSalesTile rows={data.recentSales ?? []} />
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Hit feed</p>
              {data.hits.length === 0 ? <p className="text-zinc-500">No hits logged yet.</p> : null}
              {data.hits.slice(0, 20).map((h) => (
                <div key={h.id} className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="font-semibold text-zinc-100">{h.title}</p>
                  <p className="mt-0.5 text-zinc-500">
                    {h.spotLabel ? `${h.spotLabel} · ` : ""}
                    {h.buyer ? `@${h.buyer.username} · ` : ""}
                    {new Date(h.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {hostMobilePanel === "more" ? (
          <div className="space-y-2 pb-2">
            <Link
              href={`/live/${encodeURIComponent(roomId)}`}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-white/12 px-3 py-2 text-sm font-semibold text-gold-bright"
            >
              Open public room
            </Link>
            <button
              type="button"
              onClick={() => void copyPublic()}
              className="w-full rounded-lg border border-white/12 px-3 py-2 text-sm text-zinc-200"
            >
              Copy public link
            </button>
            <Link
              href="/seller/live"
              className="block rounded-lg border border-white/10 px-3 py-2 text-center text-sm text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            >
              Seller live hub
            </Link>
          </div>
        ) : null}
      </MobileBottomSheet>

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

      {queueAddModal ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setQueueAddModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {queueAddModal === "auction" ? (
              <>
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Add queue item</h2>
                <input
                  value={auctionDraftTitle}
                  onChange={(e) => setAuctionDraftTitle(e.target.value)}
                  placeholder="Title"
                  className="mt-3 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
                />
                <input
                  value={auctionDraftPrice}
                  onChange={(e) => setAuctionDraftPrice(e.target.value)}
                  placeholder="Price USD (optional)"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
                />
                <input
                  inputMode="numeric"
                  value={auctionDraftQuantity}
                  onChange={(e) => setAuctionDraftQuantity(e.target.value)}
                  placeholder="Quantity"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
                  aria-label="Quantity"
                />
                <p className="mt-1 text-[11px] text-zinc-500">Quantity appears on a single queue card (for example ×32).</p>
                <input
                  value={auctionDraftStartBid}
                  onChange={(e) => setAuctionDraftStartBid(e.target.value)}
                  placeholder="Starting bid USD (default 1.00)"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm"
                />
                {data.room.teamBoardLeague === "nfl" ? (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={queueDraftMisc}
                      onChange={(e) => setQueueDraftMisc(e.target.checked)}
                      className="rounded border-white/20 bg-[#0c0c10]"
                    />
                    MISC spot (shows MISC on team board while this item is active)
                  </label>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQueueAddModal(null)}
                    className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitAuctionAdd()}
                    className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </>
            ) : queueAddModal === "bin" ? (
              <>
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Add BIN item</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  BIN queue is not wired to the API yet. Use the auction queue for live lots for now.
                </p>
                <button
                  type="button"
                  onClick={() => setQueueAddModal(null)}
                  className="mt-4 w-full rounded-lg bg-gold/25 py-2.5 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Add Givvy</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  Giveaway queue is not wired yet. This tab will connect to your givvy flow when the API is ready.
                </p>
                <button
                  type="button"
                  onClick={() => setQueueAddModal(null)}
                  className="mt-4 w-full rounded-lg bg-gold/25 py-2.5 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
