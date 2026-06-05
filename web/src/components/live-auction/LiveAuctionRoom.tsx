"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BreakBuyerOverview } from "@/components/live-auction/BreakBuyerOverview";
import { BuyerBreakPaymentPrompt } from "@/components/live-auction/BuyerBreakPaymentPrompt";
import { BreakDisclaimerModal, breakDisclaimerStorageKey } from "@/components/live-auction/BreakDisclaimerModal";
import { LiveBuyerWalletGateHint } from "@/components/live-auction/LiveBuyerWalletGateHint";
import { LiveVariantSelectionSheet } from "@/components/live-auction/LiveVariantSelectionSheet";
import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { LiveAuctionChat } from "@/components/live-auction/LiveAuctionChat";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { LiveTipSheet } from "@/components/live-auction/LiveTipSheet";
import { BuyerLiveActionRail } from "@/components/live-auction/buyer/BuyerLiveActionRail";
import { BuyerLiveDesktopShell } from "@/components/live-auction/buyer/BuyerLiveDesktopShell";
import { BuyerLiveHostStrip } from "@/components/live-auction/buyer/BuyerLiveHostStrip";
import { BuyerLiveItemBoard } from "@/components/live-auction/buyer/BuyerLiveItemBoard";
import { BuyerLiveNextUpRail } from "@/components/live-auction/buyer/BuyerLiveNextUpRail";
import { BuyerLiveQueueList } from "@/components/live-auction/buyer/BuyerLiveQueueList";
import { BuyerLiveQueueSheet } from "@/components/live-auction/buyer/BuyerLiveQueueSheet";
import { BUYER_LIVE_MAIN_SECTION, BUYER_LIVE_PAGE_GRID } from "@/components/live-auction/buyer/buyerLiveLayout";
import { HostLiveRoomConsoleBanner } from "@/components/live-auction/buyer/HostLiveRoomConsoleBanner";
import { useBuyerLiveDesktop } from "@/components/live-auction/buyer/useBuyerLiveDesktop";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { TeamBoardChromeButton } from "@/components/team-board/TeamBoardChromeButton";
import { TeamBoardOverlay } from "@/components/team-board/TeamBoardOverlay";
import type { LiveRoomBreakPublicDTO, LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import { parseTeamBoardPublicPayload, type TeamBoardPublicPayload } from "@/lib/team-board-public";
import { liveAuctionMinBidUsd } from "@/lib/auction";
import { liveAuctionDisplayBidUsd } from "@/lib/live-auction-overlay-price";
import { LIVE_AUCTION_CLIENT_END_GRACE_MS } from "@/lib/live-auction-bid-extension";
import { createLiveBidIdempotencyKey, liveBidRequestHeaders } from "@/lib/live-bid-client";
import {
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
  LIVE_AUCTION_HOST_TIMER_ENDED_COPY,
  resolveLiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";
import { patchLiveRoomItemStatus, startLiveRoomItemAuction } from "@/lib/live-room-control-client";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { syncedWallTimeMs } from "@/lib/server-clock-sync";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";

type SaleItem = {
  id: string;
  title: string;
  displayTitle: string;
  progressLabel: string | null;
  quantity: number;
  imageUrl: string;
  description?: string;
  shippingLine?: string;
  buyNow: number;
  topBid: number;
  bids: number;
  /** `posted` = on the board before the show is live; bidding still closed. */
  status: "live" | "posted" | "queued" | "sold" | "skipped";
};

function mapDbItem(i: LiveRoomItemDTO, roomIsLive: boolean, clockSkewMs = 0): SaleItem {
  const now = syncedWallTimeMs(clockSkewMs);
  const endsMs = i.auctionEndsAt ? Date.parse(i.auctionEndsAt) : NaN;
  const hasScheduledEnd = Number.isFinite(endsMs);
  /** Host Start always sets `auctionEndsAt`; require it so we never show bid UI before a timed window exists. Grace absorbs skew (see `LIVE_AUCTION_CLIENT_END_GRACE_MS`). */
  const biddingWindowOpen =
    i.biddingOpen === true &&
    hasScheduledEnd &&
    endsMs > now - LIVE_AUCTION_CLIENT_END_GRACE_MS;
  const status: SaleItem["status"] =
    i.status === "sold"
      ? "sold"
      : i.status === "skipped"
        ? "skipped"
        : i.status === "active"
          ? roomIsLive && biddingWindowOpen
            ? "live"
            : "posted"
          : "queued";
  const top = liveAuctionDisplayBidUsd({
    currentBidUsd: i.currentBidUsd,
    startingBidUsd: i.startingBidUsd,
    lastHighBidderId: i.lastHighBidderId,
    lastHighBidderUsername: i.lastHighBidderUsername,
  });
  const buy = i.priceUsd ?? Math.max(top, 1);
  const quantity = typeof i.quantity === "number" && Number.isFinite(i.quantity) && i.quantity >= 0 ? Math.floor(i.quantity) : 1;
  return {
    id: i.id,
    title: i.title,
    displayTitle: i.displayTitle ?? i.title,
    progressLabel: i.progressLabel ?? null,
    quantity,
    imageUrl: i.imageUrl,
    buyNow: buy,
    topBid: top,
    bids: 0,
    status,
  };
}

export type LiveAuctionRoomProps = {
  breakId: string;
  roomTitle?: string;
  sellerId: string;
  sellerShopUsername?: string;
  hostDisplayName: string;
  viewerCount: number;
  isLive: boolean;
  roomStatus: LiveRoomStatus;
  liveRoomId: string;
  dbItems: LiveRoomItemDTO[];
  messages: LiveRoomMessageDTO[];
  onMessagesChange: (next: LiveRoomMessageDTO[] | ((prev: LiveRoomMessageDTO[]) => LiveRoomMessageDTO[])) => void;
  onRefetch?: () => void;
  /** Merge authoritative item + clock from POST bid / PATCH start responses before realtime arrives. */
  onAuctionHttpAck?: (ack: {
    serverNowMs?: number;
    roomVersion?: number;
    auctionSeq?: number;
    item?: LiveRoomItemDTO | null;
  }) => void;
  /** DB-backed break snapshot for buyers. */
  break?: LiveRoomBreakPublicDTO | null;
  /** Bumped by `LiveRoomShell` when realtime team board events arrive. */
  teamBoardTick?: number;
  /** Bumped on `stream_status` / Supabase reconnect so IVS playback refetches stream info. */
  streamPlaybackRefreshNonce?: number;
  /** ISO scheduled start for buyer video placeholder (countdown / date). */
  scheduledStartAt?: string | null;
  /** Host-uploaded room thumbnail; rendered as the video stage placeholder until the stream is live. */
  thumbnailUrl?: string | null;
  /** Estimated server − client clock skew (ms); keeps countdown aligned with server auction end. */
  clockSkewMs?: number;
  /** When `false`, non-host buyers cannot bid until they add a saved card (server also enforces on POST). */
  buyerLiveBidPaymentReady?: boolean;
  /** When `false`, non-host buyers need a shipping address in Wallet (server enforces on POST). */
  buyerLiveShippingReady?: boolean;
};

function fmt(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

const AUCTION_DURATION_CHOICES: { sec: number; label: string }[] = [
  { sec: 5, label: "5s" },
  { sec: 10, label: "10s" },
  { sec: 15, label: "15s" },
  { sec: 20, label: "20s" },
  { sec: 30, label: "30s" },
];

function formatCountdownMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function parseAuctionHttpAckPayload(raw: unknown): {
  serverNowMs?: number;
  roomVersion?: number;
  auctionSeq?: number;
  item?: LiveRoomItemDTO;
} {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const serverNowMs =
    typeof o.serverNowMs === "number" && Number.isFinite(o.serverNowMs) ? o.serverNowMs : undefined;
  const roomVersion =
    typeof o.roomVersion === "number" && Number.isFinite(o.roomVersion) ? Math.floor(o.roomVersion) : undefined;
  const auctionSeq =
    typeof o.auctionSeq === "number" && Number.isFinite(o.auctionSeq) ? Math.floor(o.auctionSeq) : undefined;
  const itemCandidate = o.item;
  const item =
    itemCandidate &&
    typeof itemCandidate === "object" &&
    typeof (itemCandidate as LiveRoomItemDTO).id === "string" &&
    typeof (itemCandidate as LiveRoomItemDTO).itemVersion === "number"
      ? (itemCandidate as LiveRoomItemDTO)
      : undefined;
  return { serverNowMs, roomVersion, auctionSeq, item };
}

export function LiveAuctionRoom({
  breakId: _breakId,
  roomTitle,
  sellerId,
  sellerShopUsername,
  hostDisplayName,
  viewerCount,
  isLive,
  roomStatus,
  liveRoomId,
  dbItems,
  messages,
  onMessagesChange,
  onRefetch,
  onAuctionHttpAck,
  break: breakSnapshot = null,
  teamBoardTick = 0,
  streamPlaybackRefreshNonce,
  scheduledStartAt = null,
  thumbnailUrl = null,
  clockSkewMs: clockSkewProp = 0,
  buyerLiveBidPaymentReady,
  buyerLiveShippingReady,
}: LiveAuctionRoomProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const shopHref =
    sellerShopUsername && sellerShopUsername.trim().length > 0 ? sellerProfilePath(sellerShopUsername.trim()) : null;

  /** Two-column rail only on wide desktop (1400px+). Tablets/iPads stay stacked: queue below video like phone. */
  const [buyerWideRail, setBuyerWideRail] = useState(false);
  const [buyerLineupOpen, setBuyerLineupOpen] = useState(false);
  const isBuyerDesktop = useBuyerLiveDesktop();
  const [tipOpen, setTipOpen] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1400px)");
    const apply = () => setBuyerWideRail(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const clockSkewMs = clockSkewProp;
  const [auctionResolutionTick, setAuctionResolutionTick] = useState(0);
  useEffect(() => {
    const active = dbItems.find((x) => x.status === "active");
    if (!active?.auctionEndsAt) return undefined;
    const ends = Date.parse(active.auctionEndsAt);
    if (!Number.isFinite(ends)) return undefined;
    const id = window.setInterval(() => setAuctionResolutionTick((t) => t + 1), 50);
    return () => window.clearInterval(id);
  }, [dbItems]);

  const mappedDb = useMemo(
    () => dbItems.map((i) => mapDbItem(i, isLive, clockSkewMs)),
    [dbItems, isLive, auctionResolutionTick, clockSkewMs],
  );
  const activeDbItem = useMemo(() => dbItems.find((x) => x.status === "active") ?? null, [dbItems]);
  const activeHasVariants = Boolean(
    activeDbItem && isVariantSalesFormat(activeDbItem.salesFormat) && (activeDbItem.variants?.length ?? 0) > 0,
  );
  const [hostAuctionDurationSec, setHostAuctionDurationSec] = useState(5);
  const [hostClutchTimeEnabled, setHostClutchTimeEnabled] = useState(false);
  const [hostAuctionBusy, setHostAuctionBusy] = useState(false);
  const [hostMarkSoldBusy, setHostMarkSoldBusy] = useState(false);
  const [queueItems, setQueueItems] = useState<SaleItem[]>(mappedDb);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  /** Blocks double-submit while bid POST is in flight. */
  const [bidFlight, setBidFlight] = useState(false);
  const [userHighBidUsd, setUserHighBidUsd] = useState<number | null>(null);
  const [showOutbidToast, setShowOutbidToast] = useState(false);
  const [teamBoardData, setTeamBoardData] = useState<TeamBoardPublicPayload | null>(null);
  const [teamBoardBusy, setTeamBoardBusy] = useState(false);
  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  /** Local toggle (public /live page) — same control as host console; does not change server `visible`. */
  const [teamBoardUiOpen, setTeamBoardUiOpen] = useState(false);

  const loadTeamBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/team-board`, { cache: "no-store" });
      if (!res.ok) return;
      const raw: unknown = await res.json();
      const j = parseTeamBoardPublicPayload(raw);
      if (j) setTeamBoardData(j);
    } catch {
      /* Failed to fetch: ignore; interval / tick will retry */
    }
  }, [liveRoomId]);

  useEffect(() => {
    void loadTeamBoard();
    if (!isLive) return undefined;
    const id = window.setInterval(() => void loadTeamBoard(), 5000);
    return () => window.clearInterval(id);
  }, [liveRoomId, loadTeamBoard, teamBoardTick, isLive]);

  useEffect(() => {
    setTeamBoardUiOpen(false);
  }, [liveRoomId]);

  useEffect(() => {
    setQueueItems(mappedDb);
  }, [mappedDb]);

  useEffect(() => {
    const active = dbItems.find((i) => i.status === "active");
    const next = active?.id ?? dbItems[0]?.id ?? "";
    setSelectedId((prev) => (prev && mappedDb.some((m) => m.id === prev) ? prev : next));
  }, [dbItems, mappedDb]);

  const buyerLineupItems = useMemo(
    () => queueItems.filter((i) => i.status !== "sold" && i.status !== "skipped"),
    [queueItems],
  );
  const buyerNextUpItem = useMemo(() => {
    const active = buyerLineupItems.find((i) => i.status === "live" || i.id === selectedId);
    return buyerLineupItems.find((i) => i.id !== active?.id) ?? buyerLineupItems[0] ?? null;
  }, [buyerLineupItems, selectedId]);

  const selectedQueue = queueItems.find((t) => t.id === selectedId) ?? null;
  const hasQueuedItems = queueItems.some((i) => i.status !== "sold" && i.status !== "skipped");
  /** Prefer the timed “live” row; a stale `posted` row earlier in the list must not steal focus from the open lot. */
  const activeQueueItem =
    queueItems.find((i) => i.status === "live") ?? queueItems.find((i) => i.status === "posted") ?? null;
  const showFeaturedAuctionOverlay =
    roomStatus !== "ended" && Boolean(activeQueueItem) && (roomStatus === "scheduled" || roomStatus === "live");
  const overlayItem = selectedQueue ?? activeQueueItem;
  const nowWall = syncedWallTimeMs(clockSkewMs);
  const activeLotBidPhase = useMemo(
    () => (activeDbItem ? resolveLiveAuctionLotBidPhase(activeDbItem, nowWall) : "inactive"),
    [activeDbItem, nowWall, auctionResolutionTick],
  );
  /** Active lot is in the host-started timed bidding window (same as buyer bid affordance). */
  const overlayIsLive = activeLotBidPhase === "bidding_open";
  const overlayTimerEndedUnsettled = activeLotBidPhase === "timer_ended_unsettled";

  const buyerCurrentHighUsd = useMemo(() => {
    if (!activeDbItem) return 0;
    return liveAuctionDisplayBidUsd({
      currentBidUsd: activeDbItem.currentBidUsd,
      startingBidUsd: activeDbItem.startingBidUsd,
      lastHighBidderId: activeDbItem.lastHighBidderId,
      lastHighBidderUsername: activeDbItem.lastHighBidderUsername,
    });
  }, [activeDbItem]);

  const buyerNextBidUsd = useMemo(
    () => (activeDbItem ? liveAuctionMinBidUsd(activeDbItem) : 0),
    [activeDbItem],
  );

  useEffect(() => {
    setUserHighBidUsd(null);
  }, [activeDbItem?.id]);

  useEffect(() => {
    const cur = buyerCurrentHighUsd;
    const mine = userHighBidUsd;
    if (mine == null || cur == null) return;
    if (cur > mine + 0.01) {
      setShowOutbidToast(true);
      setUserHighBidUsd(null);
      const t = window.setTimeout(() => setShowOutbidToast(false), 3200);
      return () => window.clearTimeout(t);
    }
  }, [buyerCurrentHighUsd, userHighBidUsd]);

  const overlayMessage = `Live · ${selectedQueue?.title ?? activeQueueItem?.title ?? "Item"} · ${fmt(
    selectedQueue?.buyNow ?? selectedQueue?.topBid ?? activeQueueItem?.buyNow ?? activeQueueItem?.topBid ?? 0,
  )}`;

  const spotPriceUsd = selectedQueue?.buyNow ?? selectedQueue?.topBid ?? activeQueueItem?.buyNow ?? activeQueueItem?.topBid ?? 0;
  /** Item chrome shows last agreed price; bid CTA uses next increment (see `minNextBidUsd`). */
  const displayPrimaryUsd = overlayIsLive ? buyerCurrentHighUsd : spotPriceUsd;
  const displaySpotAmount = displayPrimaryUsd.toFixed(2);
  const primaryActionLabel = overlayIsLive
    ? `Place bid ${fmt(buyerNextBidUsd)}`
    : `Claim spot ${fmt(spotPriceUsd)}`;
  const primaryButtonLabel = !overlayIsLive && busy ? "Claiming…" : primaryActionLabel;
  const selectedQueueUnavailable = !selectedQueue || selectedQueue.status === "sold" || selectedQueue.status === "skipped";
  /** Bidding uses `activeDbItem`; selection can point at another row (sold/queued) and must not grey out the bid CTA. */
  const bidActionLocked = overlayIsLive
    ? false
    : overlayTimerEndedUnsettled ||
      selectedQueueUnavailable ||
      selectedQueue?.status === "queued" ||
      selectedQueue?.status === "posted";
  const isHost = Boolean(session?.user?.id && session.user.id === sellerId);
  const queueStatusLabelRaw = selectedQueue?.status ?? activeQueueItem?.status ?? "queued";
  /** Active lot bidding comes from `activeDbItem`; selection can point at another row — don’t hide the timer or “live” copy. */
  const queueStatusLabel =
    activeLotBidPhase === "bidding_open"
      ? "live"
      : activeLotBidPhase === "timer_ended_unsettled"
        ? "ended_pending"
        : queueStatusLabelRaw;
  const queueStatusText =
    queueStatusLabel === "live"
      ? "Auction live — bidding open"
      : queueStatusLabel === "ended_pending"
        ? isHost
          ? LIVE_AUCTION_HOST_TIMER_ENDED_COPY
          : LIVE_AUCTION_BUYER_TIMER_ENDED_COPY
      : queueStatusLabel === "posted"
        ? isLive
          ? "Posted — host opens bidding from the video"
          : "Posted on board — bidding opens when show is live"
        : queueStatusLabel === "queued"
          ? "Auction has not started yet"
          : queueStatusLabel === "sold"
            ? "Auction closed"
            : "Item skipped";
  const streamTitle = breakSnapshot?.displayTitle ?? roomTitle ?? "Live break";

  const payReady = buyerLiveBidPaymentReady !== false;
  const shipReady = buyerLiveShippingReady !== false;
  const buyerLiveWalletReady = payReady && shipReady;
  const auctionRemainingMs = useMemo(() => {
    void auctionResolutionTick;
    if (!activeDbItem?.biddingOpen || !activeDbItem.auctionEndsAt) return null;
    const ends = Date.parse(activeDbItem.auctionEndsAt);
    if (!Number.isFinite(ends)) return null;
    return Math.max(0, ends - syncedWallTimeMs(clockSkewMs));
  }, [activeDbItem?.biddingOpen, activeDbItem?.auctionEndsAt, activeDbItem?.id, auctionResolutionTick, clockSkewMs]);

  const biddingWindowStillRunning = activeLotBidPhase === "bidding_open";
  const auctionCountdownLabel =
    biddingWindowStillRunning && activeDbItem?.auctionEndsAt && auctionRemainingMs != null
      ? formatCountdownMs(auctionRemainingMs)
      : null;
  const hostStartEnabled = Boolean(isLive && activeDbItem?.status === "active" && activeLotBidPhase === "not_started");
  const hostTimerEndedUnsettled = isLive && activeLotBidPhase === "timer_ended_unsettled";
  const guestNeedsAuth = status === "unauthenticated" && !isHost && isLive;
  const sessionBlocksBuyer = (status === "unauthenticated" || status === "loading") && !isHost && isLive;
  const buyerClaimsBlocked = Boolean(
    breakSnapshot && (breakSnapshot.breakPaused || breakSnapshot.lockPurchases || breakSnapshot.breakFull),
  );

  /**
   * Buyers in a break room must accept the Live Break Notice before any
   * participation action (claim spot, team pick, pay) is enabled. Acceptance
   * is persisted per user + room so re-entries within the same browser are
   * not nagged. Hosts and signed-out viewers are not prompted — signed-out
   * viewers are first sent through `/signin` by `handlePlaceBid`, then
   * prompted on return as authenticated buyers.
   */
  const [breakDisclaimerAccepted, setBreakDisclaimerAccepted] = useState(true);
  const userIdForGate = session?.user?.id ?? null;
  const showBreakDisclaimer =
    status === "authenticated" && !isHost && !breakDisclaimerAccepted;

  useEffect(() => {
    if (status !== "authenticated" || isHost) {
      setBreakDisclaimerAccepted(true);
      return;
    }
    try {
      const key = breakDisclaimerStorageKey(liveRoomId, userIdForGate);
      const stored = window.localStorage.getItem(key);
      setBreakDisclaimerAccepted(stored === "1");
    } catch {
      setBreakDisclaimerAccepted(false);
    }
  }, [liveRoomId, status, isHost, userIdForGate]);

  const handleAcceptBreakDisclaimer = useCallback(() => {
    try {
      const key = breakDisclaimerStorageKey(liveRoomId, userIdForGate);
      window.localStorage.setItem(key, "1");
    } catch {
      /* localStorage may be disabled (private mode). Acceptance still applies for this session. */
    }
    setBreakDisclaimerAccepted(true);
  }, [liveRoomId, userIdForGate]);

  const handleDeclineBreakDisclaimer = useCallback(() => {
    router.back();
  }, [router]);

  const actionsDisabled =
    !isLive ||
    isHost ||
    busy ||
    (overlayIsLive && bidFlight) ||
    sessionBlocksBuyer ||
    buyerClaimsBlocked ||
    bidActionLocked ||
    !breakDisclaimerAccepted ||
    (!isHost && isLive && !buyerLiveWalletReady);

  const handleTeamPick = useCallback(
    async (teamAbbr: string) => {
      if (!breakDisclaimerAccepted && !isHost) {
        setActionError("Accept the live break notice before picking a team.");
        return;
      }
      setTeamBoardBusy(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/team-board/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamAbbr }),
        });
        const raw: unknown = await res.json().catch(() => ({}));
        const errBody = raw as { error?: string };
        if (!res.ok) {
          setActionError(typeof errBody.error === "string" ? errBody.error : "Could not record pick.");
          return;
        }
        const parsed = parseTeamBoardPublicPayload(raw);
        if (parsed) setTeamBoardData(parsed);
        await loadTeamBoard();
        await onRefetch?.();
        router.refresh();
      } finally {
        setTeamBoardBusy(false);
      }
    },
    [liveRoomId, loadTeamBoard, onRefetch, router],
  );

  const redirectSignIn = (returnPath: string) => {
    router.push(`/signin?returnTo=${encodeURIComponent(returnPath)}`);
  };

  const handlePlaceBid = async () => {
    setActionError(null);
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    if (!breakDisclaimerAccepted && !isHost) {
      setActionError("Accept the live break notice before bidding.");
      return;
    }
    if (activeLotBidPhase === "timer_ended_unsettled") {
      setActionError(LIVE_AUCTION_BUYER_TIMER_ENDED_COPY);
      return;
    }
    if (overlayIsLive && activeDbItem) {
      const amount = buyerNextBidUsd;
      setBidFlight(true);
      const idempotencyKey = createLiveBidIdempotencyKey();
      try {
        const res = await fetch(
          `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(activeDbItem.id)}/bid`,
          {
            method: "POST",
            headers: liveBidRequestHeaders(idempotencyKey),
            body: JSON.stringify({ amountUsd: amount }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string; signInUrl?: string };
        if (res.status === 401) {
          if (data.signInUrl) router.push(data.signInUrl);
          else redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
          return;
        }
        if (!res.ok) {
          setActionError(data.error ?? "Could not place bid.");
          toast(data.error ?? "Could not place bid.");
          return;
        }
        const ack = parseAuctionHttpAckPayload(data);
        if (process.env.NODE_ENV === "development") {
          console.debug("[live-auction-client] bid HTTP ACK (break overlay)", ack);
        }
        onAuctionHttpAck?.(ack);
        const uid = session?.user?.id;
        if (uid && ack.item?.lastHighBidderId === uid) {
          setUserHighBidUsd(ack.item.currentBidUsd ?? amount);
        } else {
          setUserHighBidUsd(null);
        }
        toast("Bid placed.");
        window.setTimeout(() => {
          void onRefetch?.();
          router.refresh();
        }, 750);
      } catch {
        toast("Could not place bid.");
      } finally {
        setBidFlight(false);
      }
      return;
    }

    if (!selectedQueue) {
      setActionError("Select a spot in the queue first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/break-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveRoomItemId: selectedId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signInUrl?: string };
      if (res.status === 401) {
        if (data.signInUrl) router.push(data.signInUrl);
        else redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
        return;
      }
      if (!res.ok) {
        setActionError(data.error ?? "Could not claim spot.");
        toast(data.error ?? "Could not claim spot.");
        return;
      }
      toast("Claim submitted.");
      void onRefetch?.();
      router.refresh();
    } catch {
      toast("Could not claim spot.");
    } finally {
      setBusy(false);
    }
  };

  const handleHostMarkSold = useCallback(async () => {
    if (!activeDbItem || activeLotBidPhase !== "timer_ended_unsettled") return;
    setHostMarkSoldBusy(true);
    setActionError(null);
    try {
      const r = await patchLiveRoomItemStatus(liveRoomId, activeDbItem.id, "sold");
      if (!r.ok) {
        setActionError(r.error);
        toast(r.error);
        return;
      }
      toast("Winner settled — buyer can complete payment.");
      await onRefetch?.();
      router.refresh();
    } finally {
      setHostMarkSoldBusy(false);
    }
  }, [activeDbItem, activeLotBidPhase, liveRoomId, onRefetch, router, toast]);

  const handleHostStartAuction = useCallback(async () => {
    if (!activeDbItem) return;
    setHostAuctionBusy(true);
    setActionError(null);
    try {
      const res = await startLiveRoomItemAuction(liveRoomId, activeDbItem.id, hostAuctionDurationSec, hostClutchTimeEnabled);
      if (!res.ok) {
        setActionError(res.error);
        toast(res.error);
        return;
      }
      onAuctionHttpAck?.(parseAuctionHttpAckPayload(res.data));
      toast("Bidding is open.");
      void onRefetch?.();
      router.refresh();
    } finally {
      setHostAuctionBusy(false);
    }
  }, [activeDbItem, hostAuctionDurationSec, hostClutchTimeEnabled, liveRoomId, onAuctionHttpAck, onRefetch, router, toast]);

  const handleShare = useCallback(async () => {
    const title = streamTitle;
    const shareUrl = typeof window !== "undefined" ? window.location.href : `/live/${encodeURIComponent(liveRoomId)}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: `Join ${title} on Vaulted Live`, url: shareUrl });
        toast("Shared.");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast("Link copied.");
        return;
      }
      toast("Share is not supported on this device.");
    } catch {
      toast("Could not share right now.");
    }
  }, [liveRoomId, streamTitle, toast]);

  const handleWallet = useCallback(() => {
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    toast("Opening wallet and payment status.");
    router.push("/account/orders");
  }, [liveRoomId, router, status, toast]);

  const handleTip = useCallback(() => {
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    if (!isLive) {
      toast("Tips are available when the show is live.");
      return;
    }
    setTipOpen(true);
  }, [isLive, liveRoomId, status, toast]);

  const desktopVideoOverlay = (
    <div className="live-desktop-action-hud p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p data-testid="live-active-item-title" className="line-clamp-1 text-sm font-bold text-zinc-50">
            {selectedQueue?.displayTitle ?? activeQueueItem?.displayTitle ?? "Current item"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <p className="font-black text-amber-100">${displaySpotAmount}</p>
            <span className="text-zinc-400">•</span>
            <p className="font-medium text-zinc-200">{selectedQueue?.bids ?? activeQueueItem?.bids ?? 0} bids</p>
            <span className="text-zinc-400">•</span>
            <p className="text-zinc-300">{hostDisplayName}</p>
          </div>
          <p
            className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
              queueStatusLabel === "live"
                ? "text-emerald-300"
                : queueStatusLabel === "posted"
                  ? "text-violet-200"
                  : "text-amber-200"
            }`}
          >
            {queueStatusText}
          </p>
          {auctionCountdownLabel ? (
            <p className="mt-2 text-[11px] font-black tabular-nums text-emerald-200">Time left {auctionCountdownLabel}</p>
          ) : null}
          {isHost && activeDbItem?.status === "active" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              {!isLive ? (
                <p className="text-[10px] text-amber-200/90">Go live first, then open bidding here.</p>
              ) : hostTimerEndedUnsettled ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-amber-200">{LIVE_AUCTION_HOST_TIMER_ENDED_COPY}</p>
                  <button
                    type="button"
                    disabled={hostMarkSoldBusy}
                    onClick={() => void handleHostMarkSold()}
                    className="rounded-md bg-gold px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 shadow-sm transition hover:brightness-110 disabled:opacity-40"
                  >
                    {hostMarkSoldBusy ? "Settling…" : "Mark sold"}
                  </button>
                </div>
              ) : biddingWindowStillRunning ? (
                <p className="text-[10px] text-emerald-200/90">
                  Bidding open · {auctionCountdownLabel ?? "—"} remaining
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                    <span className="font-semibold uppercase tracking-wide">Timer</span>
                    <select
                      value={hostAuctionDurationSec}
                      onChange={(e) => setHostAuctionDurationSec(Number(e.target.value))}
                      className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-semibold text-zinc-100"
                    >
                      {AUCTION_DURATION_CHOICES.map((c) => (
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
                    className={`group inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                      hostClutchTimeEnabled
                        ? "border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-amber-400/25 text-white shadow-[0_0_18px_-8px_rgba(217,70,239,0.9)]"
                        : "border-white/20 bg-black/45 text-zinc-300 hover:border-white/35 hover:text-zinc-100"
                    }`}
                  >
                    <span
                      className={`relative inline-flex h-4 w-7 items-center rounded-full border transition ${
                        hostClutchTimeEnabled ? "border-fuchsia-200/70 bg-fuchsia-400/30" : "border-white/25 bg-black/50"
                      }`}
                    >
                      <span
                        className={`absolute h-3 w-3 rounded-full bg-white shadow transition ${
                          hostClutchTimeEnabled ? "left-[14px]" : "left-[1px]"
                        }`}
                      />
                    </span>
                    <span>Clutch Time</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hostStartEnabled || hostAuctionBusy}
                    onClick={() => void handleHostStartAuction()}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {hostAuctionBusy ? "Starting…" : "Start"}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-[220px] shrink-0 items-center justify-end gap-2">
          <button
            data-testid="live-bid-button"
            type="button"
            disabled={actionsDisabled}
            onClick={() => void handlePlaceBid()}
            className="min-h-10 min-w-[170px] rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,opacity,filter] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
          >
            {primaryButtonLabel}
          </button>
        </div>
        {process.env.NODE_ENV === "development" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            <span>Room: {isLive ? "live" : "upcoming"}</span>
            <span>•</span>
            <span>
              Active:{" "}
              {selectedQueue ? selectedQueue.displayTitle : "none"}
            </span>
            <span>•</span>
            <span>Role: {isHost ? "seller" : "buyer"}</span>
          </div>
        ) : null}
      </div>
      <LiveShippingIndicator liveShowId={liveRoomId} pollMs={isLive ? 8000 : 0} className="mt-3" />
      {selectedQueue?.status === "posted" ? (
        <p className="mt-2 text-[10px] text-violet-200/90">
          {isLive
            ? isHost
              ? "Choose a timer and tap Start to open bidding."
              : "This lot is on display. The host will open bidding shortly."
            : "This lot is on display here. Bidding opens when the host goes live."}
        </p>
      ) : !isLive ? (
        <p className="mt-2 text-[10px] text-amber-200/90">Auction has not started yet</p>
      ) : null}
      <LiveBuyerWalletGateHint
        hide={isHost || !isLive}
        paymentReady={payReady}
        shippingReady={shipReady}
      />
      {guestNeedsAuth ? (
        <p className="mt-2 text-[10px] text-zinc-400">
          <Link href={`/signin?returnTo=${encodeURIComponent(`/live/${encodeURIComponent(liveRoomId)}`)}`} className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to bid or claim spots.
        </p>
      ) : null}
      {actionError ? <p className="mt-2 text-[10px] font-medium text-rose-300">{actionError}</p> : null}
    </div>
  );

  const desktopWaitingOverlay = (
    <div className="live-desktop-action-hud live-desktop-action-hud--compact px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Up next</p>
          <p data-testid="live-active-item-title" className="line-clamp-1 text-xs font-bold leading-tight text-zinc-50">
            {buyerNextUpItem?.displayTitle ?? buyerLineupItems[0]?.displayTitle ?? "Lineup"}
          </p>
        </div>
        <p className="shrink-0 text-[10px] font-medium tabular-nums text-zinc-300">
          {fmt(buyerNextUpItem?.topBid || buyerNextUpItem?.buyNow || buyerLineupItems[0]?.topBid || buyerLineupItems[0]?.buyNow || 0)} ·{" "}
          {buyerLineupItems.length} in queue
        </p>
      </div>
      <p className="mt-1 line-clamp-1 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
        {!isLive ? "Waiting for host to go live" : "Waiting for next lot"}
        <span className="font-normal normal-case tracking-normal text-zinc-500">
          {" · "}
          {!isLive ? "Bidding opens when the show starts" : "Host will post the next item shortly"}
        </span>
      </p>
    </div>
  );

  const desktopStageOverlay =
    showFeaturedAuctionOverlay
      ? desktopVideoOverlay
      : buyerLineupItems.length > 0 && roomStatus !== "ended"
        ? desktopWaitingOverlay
        : null;

  /** Active lot + bids live in the item board on desktop (not on the video). */
  const desktopItemBoardCommerce =
    showFeaturedAuctionOverlay
      ? desktopVideoOverlay
      : roomStatus !== "ended"
        ? desktopWaitingOverlay
        : null;

  const overlayRemainingSec =
    overlayIsLive && auctionRemainingMs != null ? auctionRemainingMs / 1000 : 0;
  const breakTimerUrgent = overlayIsLive && overlayRemainingSec <= 60 && overlayRemainingSec > 0;
  const breakTimerFinal = overlayIsLive && overlayRemainingSec <= 10 && overlayRemainingSec > 0;
  const timerLabel = overlayTimerEndedUnsettled
    ? "Ended"
    : overlayIsLive && auctionCountdownLabel != null
      ? auctionCountdownLabel
      : "--:--";
  const primaryOverlayMoneyLabel = fmt(
    overlayIsLive ? buyerNextBidUsd : (overlayItem?.buyNow ?? overlayItem?.topBid ?? 0),
  );
  const mobileVideoOverlay = (
    <div className="live-glass-sheet relative min-h-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 max-[380px]:px-1.5 max-[380px]:pt-1.5">
      <div className="flex items-start gap-2.5 max-[380px]:gap-2">
        <div className="h-11 w-9 shrink-0 overflow-hidden rounded-lg border border-[color:var(--live-border)] bg-black/35 max-[380px]:h-10 max-[380px]:w-8">
          {overlayItem?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={overlayItem.imageUrl} alt={overlayItem.title} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p data-testid="live-active-item-title" className="line-clamp-1 text-[11px] font-semibold leading-tight text-zinc-100">
            {overlayItem ? overlayItem.displayTitle : "Current item"}
          </p>
          <p className="line-clamp-1 text-[10px] text-zinc-400/90">{overlayItem?.description ?? "Premium break spot with live reveal."}</p>
          <p className="mt-0.5 line-clamp-1 text-[9px] text-zinc-500">{overlayItem?.shippingLine ?? "Shipping + taxes calculated at checkout"}</p>
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <p className="text-[13px] font-black tabular-nums tracking-tight text-gold-bright motion-safe:[animation:live-price-glow_3.2s_ease-in-out_infinite] motion-reduce:[animation:none]">
            {overlayItem
              ? overlayIsLive
                ? fmt(buyerCurrentHighUsd)
                : fmt(overlayItem.buyNow ?? overlayItem.topBid)
              : "$0"}
          </p>
          <p
            className={`mt-1 inline-flex min-w-[3.25rem] justify-end rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-bold tabular-nums ${
              overlayIsLive
                ? breakTimerFinal
                  ? "text-rose-200/95 motion-safe:[animation:live-countdown-pulse_1.15s_ease-in-out_infinite] motion-reduce:[animation:none]"
                  : breakTimerUrgent
                    ? "text-amber-200/95"
                    : "text-zinc-300"
                : "text-zinc-500"
            }`}
          >
            {overlayIsLive ? timerLabel : "--:--"}
          </p>
        </div>
      </div>
      {isHost && activeDbItem?.status === "active" ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
          {!isLive ? (
            <p className="text-center text-[9px] text-amber-200/90">Go live, then open bidding here.</p>
          ) : hostTimerEndedUnsettled ? (
            <div className="w-full space-y-1.5 text-center">
              <p className="text-[9px] font-semibold text-amber-200">{LIVE_AUCTION_HOST_TIMER_ENDED_COPY}</p>
              <button
                type="button"
                disabled={hostMarkSoldBusy}
                onClick={() => void handleHostMarkSold()}
                className="rounded-full bg-gold px-3 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-40"
              >
                {hostMarkSoldBusy ? "…" : "Mark sold"}
              </button>
            </div>
          ) : biddingWindowStillRunning ? (
            <p className="text-center text-[9px] text-emerald-200/90">Bidding open · {auctionCountdownLabel ?? "—"}</p>
          ) : (
            <>
              <label className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                <span className="font-bold uppercase tracking-wide">Timer</span>
                <select
                  value={hostAuctionDurationSec}
                  onChange={(e) => setHostAuctionDurationSec(Number(e.target.value))}
                  className="rounded-full border border-[color:var(--live-border)] bg-black/50 px-2 py-1 text-[10px] font-semibold text-zinc-100"
                >
                  {AUCTION_DURATION_CHOICES.map((c) => (
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
                disabled={!hostStartEnabled || hostAuctionBusy}
                onClick={() => void handleHostStartAuction()}
                className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
              >
                {hostAuctionBusy ? "…" : "Start"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {overlayTimerEndedUnsettled && !isHost ? (
        <p className="mt-2 text-center text-[10px] font-medium text-amber-200/90">{LIVE_AUCTION_BUYER_TIMER_ENDED_COPY}</p>
      ) : null}
      {overlayIsLive && activeHasVariants && activeDbItem ? (
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => setVariantSheetOpen(true)}
          className="mt-2 min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-40 md:min-h-11 md:text-[11px]"
        >
          Select spot
        </button>
      ) : null}
      {overlayIsLive && !activeHasVariants ? (
        <div className="mt-2 flex min-h-10 items-center gap-1.5 max-[380px]:gap-1 md:min-h-11">
          <button
            type="button"
            className="min-h-10 shrink-0 rounded-full border border-[color:var(--live-border)] bg-white/[0.06] px-2.5 text-[10px] font-bold uppercase tracking-wide text-zinc-200 transition-[transform,background-color] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] motion-reduce:active:scale-100 max-[380px]:px-2 max-[380px]:text-[9px] md:min-h-11 md:px-3"
          >
            Custom
          </button>
          <button
            data-testid="live-bid-button"
            type="button"
            disabled={actionsDisabled}
            aria-label={
              !overlayIsLive && busy
                ? "Claiming spot"
                : overlayIsLive
                  ? `Place bid ${primaryOverlayMoneyLabel}`
                  : `Claim spot ${primaryOverlayMoneyLabel}`
            }
            onClick={() => void handlePlaceBid()}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-[11px] font-black uppercase tracking-wide text-white transition-[transform,box-shadow,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 md:min-h-11 md:px-4 md:text-[12px] ${
              !overlayIsLive && busy
                ? "bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)]"
                : "bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)]"
            }`}
          >
            {!overlayIsLive && busy ? (
              "Claiming…"
            ) : (
              <span className="min-w-0 truncate tabular-nums">
                <span className="max-[380px]:hidden">{`${overlayIsLive ? "Place bid" : "Claim spot"} ${primaryOverlayMoneyLabel}`}</span>
                <span className="hidden max-[380px]:inline">{`${overlayIsLive ? "Bid" : "Claim"} ${primaryOverlayMoneyLabel}`}</span>
              </span>
            )}
          </button>
        </div>
      ) : null}
      {overlayIsLive ? null : overlayTimerEndedUnsettled ? (
        <button
          type="button"
          disabled
          className="mt-2 min-h-10 w-full rounded-full border border-amber-400/25 bg-amber-500/10 text-[11px] font-semibold text-amber-200/90 md:min-h-11"
        >
          Bidding closed
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="mt-2 min-h-10 w-full rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-zinc-400 md:min-h-11"
        >
          Auction hasn’t started
        </button>
      )}

      {guestNeedsAuth ? (
        <p className="mt-1 text-[10px] text-zinc-400">
          <Link href={`/signin?returnTo=${encodeURIComponent(`/live/${encodeURIComponent(liveRoomId)}`)}`} className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to bid or claim spots.
        </p>
      ) : null}
      {actionError ? <p className="mt-1 text-[10px] text-rose-300">{actionError}</p> : null}
    </div>
  );
  const floatingChatOverlay = (
    <div className="flex h-[min(42vh,19rem)] max-h-[min(50dvh,22rem)] max-[380px]:h-[min(32vh,14rem)] min-[768px]:h-[min(48vh,24rem)] min-h-0 w-full min-w-0 flex-col">
      <LiveAuctionChat
        liveRoomId={liveRoomId}
        messages={messages}
        onMessagesChange={onMessagesChange}
        embedded
        compact
        overlayMode
        hostUserId={sellerId}
        onMessagesRefresh={() => void onRefetch?.()}
      />
    </div>
  );

  /** Team list from API while the break is live (same for host/buyer on the public /live page). */
  const teamBoardPayloadReady = Boolean(teamBoardData?.teams.length && isLive);

  const teamBoardOverlay =
    teamBoardUiOpen && teamBoardPayloadReady && teamBoardData ? (
      <TeamBoardOverlay
        state={{ ...teamBoardData.state, visible: true }}
        picks={teamBoardData.picks}
        teams={teamBoardData.teams}
        viewerUserId={session?.user?.id ?? null}
        isRoomHost={isHost}
        canSelectTiles={
          isLive &&
          !teamBoardData.state.locked &&
          (isHost ||
            (breakDisclaimerAccepted &&
              Boolean(session?.user?.id && session.user.id === teamBoardData.state.currentPickerUserId)))
        }
        busy={teamBoardBusy}
        onPick={handleTeamPick}
      />
    ) : null;

  const showTeamsChrome = isLive && (Boolean(breakSnapshot) || hasQueuedItems);
  const teamBoardStageChrome = showTeamsChrome ? (
    <TeamBoardChromeButton
      league={teamBoardData?.state.league ?? "nba"}
      tileCount={teamBoardData?.teams.length}
      boardVisible={teamBoardUiOpen}
      disabled={!teamBoardData?.teams.length}
      onPress={() => setTeamBoardUiOpen((o) => !o)}
    />
  ) : null;
  const stageBelowAudience = <div className="flex items-center gap-2">{teamBoardStageChrome}</div>;

  const embeddedDesktopChat = (
    <LiveAuctionChat
      liveRoomId={liveRoomId}
      messages={messages}
      onMessagesChange={onMessagesChange}
      embedded
      compact
      scrollMessages
      hostUserId={sellerId}
      onMessagesRefresh={() => void onRefetch?.()}
    />
  );

  const videoStageCenterOverlay =
    teamBoardOverlay ??
    (activeHasVariants && activeDbItem ? <LiveVariantSpotBoard item={activeDbItem} /> : null);

  const videoStageProps = {
    overlayMessage,
    viewers: viewerCount,
    hostName: hostDisplayName,
    streamTitle,
    isLive,
    roomStatus,
    liveRoomId,
    hostSellerId: sellerId,
    onBack: () => router.back(),
    centerOverlay: videoStageCenterOverlay,
    centerOverlayOnTop: Boolean(teamBoardOverlay),
    stageBelowAudience: isBuyerDesktop ? undefined : stageBelowAudience,
    onNotifyMe: () => redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`),
    streamPlaybackRefreshNonce,
    scheduledStartAt,
    thumbnailUrl,
    buyerShellMode: isBuyerDesktop,
    showRightActions: !isHost && !isBuyerDesktop,
    shopHref,
    onShare: handleShare,
    onWallet: handleWallet,
    onTip: isLive && !isHost ? handleTip : undefined,
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-0 z-40 flex min-h-0 flex-col overflow-hidden overscroll-y-contain bg-black text-zinc-100 md:top-[var(--site-header-offset)]">
      <BreakDisclaimerModal
        open={showBreakDisclaimer}
        onAccept={handleAcceptBreakDisclaimer}
        onDecline={handleDeclineBreakDisclaimer}
      />
      {showOutbidToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[max(4.25rem,env(safe-area-inset-top)+2.75rem)] z-[70] w-[min(92vw,20rem)] -translate-x-1/2"
        >
          <div className="rounded-full border border-[color:var(--live-border)] bg-black/50 px-4 py-2 text-center text-[11px] font-medium leading-snug text-zinc-100 shadow-[var(--live-shadow-toast)] backdrop-blur-[var(--live-blur-xl)]">
            Outbid — new high bid on this item
          </div>
        </div>
      ) : null}
      {breakSnapshot && !isHost ? (
        <BuyerBreakPaymentPrompt
          liveRoomId={liveRoomId}
          breakSnapshot={breakSnapshot}
          currentUserId={session?.user?.id ?? null}
          isLive={isLive}
        />
      ) : null}
      {isBuyerDesktop ? (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col overflow-hidden">
          <BuyerLiveDesktopShell
            hostStrip={
              <BuyerLiveHostStrip
                hostName={hostDisplayName}
                streamTitle={streamTitle}
                hostSellerId={sellerId}
                isLive={isLive}
                roomStatus={roomStatus}
                onBack={() => router.back()}
              />
            }
            chat={embeddedDesktopChat}
            video={
              <>
                {showTeamsChrome ? (
                  <div className="pointer-events-auto absolute right-2 top-2 z-20">{teamBoardStageChrome}</div>
                ) : null}
                <LiveVideoStage
                  {...videoStageProps}
                  layout="buyerShellPlate"
                  actionOverlay={null}
                  mobileActionOverlay={null}
                  chatOverlay={null}
                />
              </>
            }
            hostBanner={isHost ? <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType="break" /> : undefined}
            itemBoard={
              !isHost ? (
                <BuyerLiveItemBoard
                  commerce={desktopItemBoardCommerce}
                  items={buyerLineupItems.map((item) => ({
                    id: item.id,
                    displayTitle: item.displayTitle,
                    metaLine: `${fmt(item.topBid || item.buyNow)} · ${item.bids} bids`,
                  }))}
                  selectedId={selectedId}
                  shopHref={shopHref}
                  onSelect={setSelectedId}
                  actions={
                    <BuyerLiveActionRail
                      layout="row"
                      liveRoomId={liveRoomId}
                      shopHref={shopHref}
                      onShare={handleShare}
                      onWallet={handleWallet}
                      onTip={isLive ? handleTip : undefined}
                    />
                  }
                />
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col overflow-y-auto p-1.5 md:p-4">
          <div className={BUYER_LIVE_PAGE_GRID}>
            <section className={BUYER_LIVE_MAIN_SECTION}>
              <div className="w-full min-h-0">
                <LiveVideoStage
                  {...videoStageProps}
                  layout={buyerWideRail ? "fillHeight" : "aspect"}
                  actionOverlay={showFeaturedAuctionOverlay ? desktopVideoOverlay : null}
                  mobileActionOverlay={showFeaturedAuctionOverlay ? mobileVideoOverlay : null}
                  chatOverlay={floatingChatOverlay}
                />
              </div>

              {isHost ? (
                <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType="break" />
              ) : buyerLineupItems.length > 0 ? (
                <BuyerLiveNextUpRail
                  nextTitle={buyerNextUpItem?.displayTitle ?? "More coming soon"}
                  nextMeta={
                    buyerNextUpItem
                      ? `${fmt(buyerNextUpItem.topBid || buyerNextUpItem.buyNow)} · ${buyerLineupItems.length} in lineup`
                      : `${buyerLineupItems.length} in lineup`
                  }
                  queueCount={buyerLineupItems.length}
                  shopHref={shopHref}
                  onOpenQueue={() => setBuyerLineupOpen(true)}
                />
              ) : null}

              {breakSnapshot ? (
                <div className="shrink-0 rounded-2xl bg-zinc-950/45 p-2.5 md:border md:border-zinc-800 md:bg-zinc-950/65 md:p-3">
                  <BreakBuyerOverview
                    break={breakSnapshot}
                    isLive={isLive}
                    liveRoomId={liveRoomId}
                    currentUserId={session?.user?.id ?? null}
                  />
                </div>
              ) : null}

              <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
            </section>
          </div>
        </div>
      )}
      <BuyerLiveQueueSheet
        open={buyerLineupOpen && !isHost}
        onClose={() => setBuyerLineupOpen(false)}
        title="Lineup"
        subtitle={`${buyerLineupItems.length} spot${buyerLineupItems.length === 1 ? "" : "s"} available`}
        shopHref={shopHref}
      >
        <BuyerLiveQueueList
          items={buyerLineupItems.map((item) => ({
            id: item.id,
            displayTitle: item.displayTitle,
            metaLine: `${fmt(item.topBid || item.buyNow)} · ${item.bids} bids`,
          }))}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setBuyerLineupOpen(false);
          }}
        />
      </BuyerLiveQueueSheet>
      {activeDbItem && activeHasVariants ? (
        <LiveVariantSelectionSheet
          open={variantSheetOpen}
          onClose={() => setVariantSheetOpen(false)}
          item={activeDbItem}
          liveRoomId={liveRoomId}
          walletReady={buyerLiveWalletReady}
          onWalletRequired={() => toast("Add payment and shipping in Wallet before checkout.")}
          onPurchased={() => void onRefetch?.()}
        />
      ) : null}
      <LiveTipSheet
        open={tipOpen}
        onClose={() => setTipOpen(false)}
        liveRoomId={liveRoomId}
        onError={(msg) => toast(msg)}
      />
    </div>
  );
}
