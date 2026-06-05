"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRealtimeListingBidsSubscription } from "@/hooks/useRealtimeListingBidsSubscription";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LiveAuctionChat } from "@/components/live-auction/LiveAuctionChat";
import { LiveBuyerWalletGateHint } from "@/components/live-auction/LiveBuyerWalletGateHint";
import { LiveVariantSelectionSheet } from "@/components/live-auction/LiveVariantSelectionSheet";
import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { LiveTipSheet } from "@/components/live-auction/LiveTipSheet";
import { BuyerLiveDesktopCommerce } from "@/components/live-auction/buyer/BuyerLiveDesktopCommerce";
import { BuyerLiveDesktopShell } from "@/components/live-auction/buyer/BuyerLiveDesktopShell";
import { BuyerLiveHostStrip } from "@/components/live-auction/buyer/BuyerLiveHostStrip";
import { BuyerLiveLineupPanel } from "@/components/live-auction/buyer/BuyerLiveLineupPanel";
import { BuyerLiveNextUpRail } from "@/components/live-auction/buyer/BuyerLiveNextUpRail";
import { BuyerLiveQueueList } from "@/components/live-auction/buyer/BuyerLiveQueueList";
import { BuyerLiveQueueSheet } from "@/components/live-auction/buyer/BuyerLiveQueueSheet";
import { BUYER_LIVE_MAIN_SECTION, BUYER_LIVE_PAGE_GRID } from "@/components/live-auction/buyer/buyerLiveLayout";
import { HostLiveRoomConsoleBanner } from "@/components/live-auction/buyer/HostLiveRoomConsoleBanner";
import { useBuyerLiveDesktop } from "@/components/live-auction/buyer/useBuyerLiveDesktop";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import type { LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { liveAuctionMinBidUsd } from "@/lib/auction";
import { liveAuctionDisplayBidUsd, resolveLiveItemOverlayPrice } from "@/lib/live-auction-overlay-price";
import { LIVE_AUCTION_CLIENT_END_GRACE_MS } from "@/lib/live-auction-bid-extension";
import { createLiveBidIdempotencyKey, liveBidRequestHeaders } from "@/lib/live-bid-client";
import {
  LIVE_AUCTION_BUYER_NOT_STARTED_COPY,
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
  LIVE_AUCTION_HOST_TIMER_ENDED_COPY,
  resolveLiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";
import { patchLiveRoomItemStatus, startLiveRoomItemAuction } from "@/lib/live-room-control-client";
import { syncedWallTimeMs } from "@/lib/server-clock-sync";
import { logAuctionTimer } from "@/lib/auction-timer-sync";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { formatAuctionLeaderLine } from "@/lib/live-auction-winner-display";
import { isVariantSalesFormat, summarizeVariantSpots, variantBuyerSelectLabel } from "@/lib/live-item-variant-presets";
import { purchaseLiveBuyNowWithSca } from "@/lib/live-buy-now-client";

type SaleItem = {
  id: string;
  title: string;
  displayTitle: string;
  progressLabel: string | null;
  quantity: number;
  category: "Trading Cards" | "Memorabilia" | "Watches" | "Sneakers" | "Other";
  buyNow: number;
  topBid: number;
  bids: number;
  status: "live" | "posted" | "queued" | "sold" | "skipped";
};

function mapDbItem(
  i: LiveRoomItemDTO,
  roomIsLive: boolean,
  clockSkewMs = 0,
  roomType: "auction" | "sale" | "break" = "auction",
): SaleItem {
  const now = syncedWallTimeMs(clockSkewMs);
  const endsMs = i.auctionEndsAt ? Date.parse(i.auctionEndsAt) : NaN;
  const hasScheduledEnd = Number.isFinite(endsMs);
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
  const top =
    roomType === "sale"
      ? (i.priceUsd ?? i.currentBidUsd ?? i.startingBidUsd ?? 0)
      : liveAuctionDisplayBidUsd({
          currentBidUsd: i.currentBidUsd,
          startingBidUsd: i.startingBidUsd,
          lastHighBidderId: i.lastHighBidderId,
          lastHighBidderUsername: i.lastHighBidderUsername,
        });
  const buy = roomType === "sale" ? (i.priceUsd ?? Math.max(top, 1)) : Math.max(top, 1);
  const quantity = typeof i.quantity === "number" && Number.isFinite(i.quantity) && i.quantity >= 0 ? Math.floor(i.quantity) : 1;
  return {
    id: i.id,
    title: i.title,
    displayTitle: i.displayTitle ?? i.title,
    progressLabel: i.progressLabel ?? null,
    quantity,
    category: "Other",
    buyNow: buy,
    topBid: top,
    bids: 0,
    status,
  };
}

function fmt(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

const SALE_AUCTION_DURATION_CHOICES: { sec: number; label: string }[] = [
  { sec: 5, label: "5s" },
  { sec: 10, label: "10s" },
  { sec: 15, label: "15s" },
  { sec: 20, label: "20s" },
  { sec: 30, label: "30s" },
];

function formatSaleAuctionCountdownMs(ms: number) {
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

type ListingBidMeta = {
  minNextBidUsd: number;
  currentBidUsd: number | null;
  auctionEnded: boolean;
  auctionEndsAt: string | null;
};

export type LiveSaleRoomProps = {
  roomId: string;
  roomTitle?: string;
  sellerShopUsername?: string;
  sellerId: string;
  hostDisplayName: string;
  viewerCount: number;
  isLive: boolean;
  roomStatus: LiveRoomStatus;
  roomType: "auction" | "sale" | "break";
  liveRoomId: string;
  dbItems: LiveRoomItemDTO[];
  messages: LiveRoomMessageDTO[];
  onMessagesChange: (next: LiveRoomMessageDTO[] | ((prev: LiveRoomMessageDTO[]) => LiveRoomMessageDTO[])) => void;
  onRefetch?: () => void;
  onAuctionHttpAck?: (ack: {
    serverNowMs?: number;
    roomVersion?: number;
    auctionSeq?: number;
    item?: LiveRoomItemDTO | null;
  }) => void;
  /** Bumped on `stream_status` / Supabase reconnect so IVS playback refetches stream info. */
  streamPlaybackRefreshNonce?: number;
  /** ISO scheduled start for buyer video placeholder (countdown / date). */
  scheduledStartAt?: string | null;
  /** Host-uploaded room thumbnail; rendered as the video stage placeholder until the stream is live. */
  thumbnailUrl?: string | null;
  clockSkewMs?: number;
  buyerLiveBidPaymentReady?: boolean;
  buyerLiveShippingReady?: boolean;
};

export function LiveSaleRoom({
  roomId: _roomId,
  roomTitle,
  sellerShopUsername,
  sellerId,
  hostDisplayName,
  viewerCount,
  isLive,
  roomStatus,
  roomType,
  liveRoomId,
  dbItems,
  messages,
  onMessagesChange,
  onRefetch,
  onAuctionHttpAck,
  streamPlaybackRefreshNonce,
  scheduledStartAt = null,
  thumbnailUrl = null,
  clockSkewMs: clockSkewProp = 0,
  buyerLiveBidPaymentReady,
  buyerLiveShippingReady,
}: LiveSaleRoomProps) {
  const { data: session, status } = useSession();
  const shopHref =
    sellerShopUsername && sellerShopUsername.trim().length > 0 ? sellerProfilePath(sellerShopUsername.trim()) : null;
  const router = useRouter();

  const clockSkewMs = clockSkewProp;
  const [liveAuctionResolutionTick, setLiveAuctionResolutionTick] = useState(0);
  useEffect(() => {
    const active = dbItems.find((x) => x.status === "active");
    if (!active?.auctionEndsAt) return undefined;
    const ends = Date.parse(active.auctionEndsAt);
    if (!Number.isFinite(ends)) return undefined;
    const id = window.setInterval(() => setLiveAuctionResolutionTick((t) => t + 1), 50);
    return () => window.clearInterval(id);
  }, [dbItems]);

  const mapped = useMemo(
    () => dbItems.map((i) => mapDbItem(i, isLive, clockSkewMs, roomType)),
    [dbItems, isLive, liveAuctionResolutionTick, clockSkewMs],
  );
  const [items, setItems] = useState<SaleItem[]>(mapped);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  /** Auction bid POST in flight — disables button. */
  const [bidFlight, setBidFlight] = useState(false);
  const [bidMeta, setBidMeta] = useState<ListingBidMeta | null>(null);
  const [shipUxNonce, setShipUxNonce] = useState(0);
  /** Last successful bid amount from this client — drives winning / outbid UX (auction rooms). */
  const [userHighBidUsd, setUserHighBidUsd] = useState<number | null>(null);
  const [showOutbidToast, setShowOutbidToast] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const [hostSaleAuctionDurationSec, setHostSaleAuctionDurationSec] = useState(5);
  const [hostSaleClutchTimeEnabled, setHostSaleClutchTimeEnabled] = useState(false);
  const [hostSaleAuctionBusy, setHostSaleAuctionBusy] = useState(false);
  const [hostMarkSoldBusy, setHostMarkSoldBusy] = useState(false);

  const [buyerWideRail, setBuyerWideRail] = useState(false);
  const [buyerLineupOpen, setBuyerLineupOpen] = useState(false);
  const isBuyerDesktop = useBuyerLiveDesktop();
  const [tipOpen, setTipOpen] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const apply = () => setBuyerWideRail(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setItems(mapped);
  }, [mapped]);

  useEffect(() => {
    const active = dbItems.find((i) => i.status === "active");
    const next = active?.id ?? dbItems[0]?.id ?? "";
    setSelectedId((prev) => (prev && mapped.some((m) => m.id === prev) ? prev : next));
  }, [dbItems, mapped]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? items[0], [items, selectedId]);
  const activeDb = useMemo(() => dbItems.find((i) => i.status === "active") ?? null, [dbItems]);
  const actionUi = useMemo(() => {
    if (activeDb) return mapDbItem(activeDb, isLive, clockSkewMs, roomType);
    return selected;
  }, [activeDb, isLive, selected, liveAuctionResolutionTick]);

  const activeListingId = activeDb?.listingId ?? null;

  useEffect(() => {
    setUserHighBidUsd(null);
  }, [activeDb?.id]);

  useEffect(() => {
    if (roomType !== "auction") return;
    const cur = bidMeta?.currentBidUsd;
    const mine = userHighBidUsd;
    if (mine == null || cur == null) return;
    if (cur > mine + 0.01) {
      setShowOutbidToast(true);
      setUserHighBidUsd(null);
      const t = window.setTimeout(() => setShowOutbidToast(false), 3200);
      return () => window.clearTimeout(t);
    }
  }, [roomType, bidMeta?.currentBidUsd, userHighBidUsd]);

  useEffect(() => {
    if (!bidMeta?.auctionEndsAt || bidMeta.auctionEnded) return;
    const id = window.setInterval(() => setClockTick((n) => n + 1), 50);
    return () => window.clearInterval(id);
  }, [bidMeta?.auctionEndsAt, bidMeta?.auctionEnded]);

  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  const refetchBidMeta = useCallback(async () => {
    if (roomType !== "auction" || !activeListingId) {
      setBidMeta(null);
      return;
    }
    const res = await fetch(`/api/listings/${encodeURIComponent(activeListingId)}/bids`, { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as {
      minNextBidUsd?: number;
      currentBidUsd?: number | null;
      auctionEnded?: boolean;
      auctionEndsAt?: string | null;
    };
    if (typeof j.minNextBidUsd === "number" && Number.isFinite(j.minNextBidUsd)) {
      setBidMeta({
        minNextBidUsd: j.minNextBidUsd,
        currentBidUsd: j.currentBidUsd ?? null,
        auctionEnded: Boolean(j.auctionEnded),
        auctionEndsAt: typeof j.auctionEndsAt === "string" ? j.auctionEndsAt : null,
      });
    } else {
      setBidMeta(null);
    }
  }, [roomType, activeListingId]);

  useEffect(() => {
    void refetchBidMeta();
  }, [refetchBidMeta, dbItems]);

  useRealtimeListingBidsSubscription(
    activeListingId,
    () => void refetchBidMeta(),
    roomType === "auction" && Boolean(activeListingId),
  );

  /** Matches `/api/live-rooms/.../bid` opening bid + increment rules. */
  const minNextFromLiveItem = useMemo(() => {
    if (roomType !== "auction" || !activeDb) return null;
    return liveAuctionMinBidUsd(activeDb);
  }, [roomType, activeDb]);

  const nextBidAmount = useMemo(() => {
    if (roomType !== "auction" || !actionUi) return "0.00";
    if (activeListingId && bidMeta && !bidMeta.auctionEnded) {
      return bidMeta.minNextBidUsd.toFixed(2);
    }
    if (minNextFromLiveItem != null) return minNextFromLiveItem.toFixed(2);
    return "0.00";
  }, [roomType, actionUi, activeListingId, bidMeta, minNextFromLiveItem]);
  const currentTopBid = actionUi?.topBid ?? 0;
  const liveTitle = actionUi ? actionUi.displayTitle : (roomTitle ?? "Vaulted Live");

  const activeOverlayPrice = useMemo(() => {
    if (!activeDb) return null;
    if (roomType === "sale") {
      return resolveLiveItemOverlayPrice({
        commerceMode: "buy_now",
        priceUsd: activeDb.priceUsd,
      });
    }
    return resolveLiveItemOverlayPrice({
      commerceMode: "auction",
      status: activeDb.status,
      currentBidUsd: activeDb.currentBidUsd,
      startingBidUsd: activeDb.startingBidUsd,
      priceUsd: activeDb.priceUsd,
      lastHighBidderId: activeDb.lastHighBidderId,
      lastHighBidderUsername: activeDb.lastHighBidderUsername,
    });
  }, [activeDb, roomType]);

  const secondsLeft = useMemo(() => {
    void clockTick;
    void liveAuctionResolutionTick;
    const now = syncedWallTimeMs(clockSkewMs);
    if (roomType === "auction" && activeDb?.biddingOpen && activeDb.auctionEndsAt) {
      const ends = Date.parse(activeDb.auctionEndsAt);
      if (Number.isFinite(ends)) {
        const remaining = Math.max(0, Math.ceil((ends - now) / 1000));
        if (clockTick % 20 === 0) {
          logAuctionTimer({
            source: "live_sale_room",
            localNowMs: Date.now(),
            offsetMs: clockSkewMs,
            auctionEndsAt: activeDb.auctionEndsAt,
            remainingMs: Math.max(0, ends - now),
          });
        }
        return remaining;
      }
    }
    if (roomType !== "auction" || !bidMeta || bidMeta.auctionEnded || !bidMeta.auctionEndsAt) return null;
    return Math.max(0, Math.ceil((Date.parse(bidMeta.auctionEndsAt) - now) / 1000));
  }, [roomType, activeDb, bidMeta, clockTick, liveAuctionResolutionTick, clockSkewMs]);

  const countdownLabel =
    secondsLeft != null
      ? `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;
  const countdownUrgent = secondsLeft != null && secondsLeft > 0 && secondsLeft <= 60;
  const countdownFinal = secondsLeft != null && secondsLeft > 0 && secondsLeft <= 10;

  const isWinning =
    roomType === "auction" &&
    userHighBidUsd != null &&
    bidMeta?.currentBidUsd != null &&
    !bidMeta.auctionEnded &&
    Math.abs(bidMeta.currentBidUsd - userHighBidUsd) < 0.02;

  const queue = items.filter((i) => i.status !== "sold" && i.status !== "skipped");
  const buyerNextUpItem = useMemo(() => {
    const active = queue.find((i) => i.status === "live" || i.id === selectedId);
    return queue.find((i) => i.id !== active?.id) ?? queue[0] ?? null;
  }, [queue, selectedId]);

  const isHost = Boolean(session?.user?.id && session.user.id === sellerId);
  const payReady = buyerLiveBidPaymentReady !== false;
  const shipReady = buyerLiveShippingReady !== false;
  const buyerLiveWalletReady = payReady && shipReady;

  /** Listing min/next + leader come from `/api/listings/.../bids`; poll while the lot is open so buyers stay in sync if realtime drops. */
  useEffect(() => {
    if (roomType !== "auction" || !isLive || isHost) return;
    if (!activeDb?.listingId) return;
    if (activeDb.status !== "active" || !activeDb.biddingOpen || !activeDb.auctionEndsAt) return;
    const id = window.setInterval(() => void refetchBidMeta(), 850);
    return () => window.clearInterval(id);
  }, [roomType, isLive, isHost, activeDb?.listingId, activeDb?.status, activeDb?.biddingOpen, activeDb?.auctionEndsAt, refetchBidMeta]);

  const nowWall = syncedWallTimeMs(clockSkewMs);
  const activeLotBidPhase = useMemo(
    () => (activeDb ? resolveLiveAuctionLotBidPhase(activeDb, nowWall) : "inactive"),
    [activeDb, nowWall, liveAuctionResolutionTick, clockTick],
  );
  const liveItemBiddingOpen =
    roomType === "auction" && activeLotBidPhase === "bidding_open";
  const hostSaleAuctionCountdownLabel =
    roomType === "auction" && activeDb?.auctionEndsAt && activeLotBidPhase === "bidding_open"
      ? (() => {
          const ends = Date.parse(activeDb.auctionEndsAt);
          if (!Number.isFinite(ends)) return null;
          return formatSaleAuctionCountdownMs(ends - syncedWallTimeMs(clockSkewMs));
        })()
      : null;
  const hostSaleStartEnabled =
    roomType === "auction" &&
    isLive &&
    Boolean(activeDb?.status === "active") &&
    activeLotBidPhase === "not_started";
  const hostTimerEndedUnsettled =
    roomType === "auction" && isLive && activeLotBidPhase === "timer_ended_unsettled";
  const guestNeedsAuth = status === "unauthenticated" && !isHost && isLive;
  const sessionBlocksBuyer = (status === "unauthenticated" || status === "loading") && !isHost && isLive;
  const actionsDisabled =
    !isLive ||
    isHost ||
    busy ||
    bidFlight ||
    sessionBlocksBuyer ||
    ((roomType === "auction" || roomType === "sale") && !isHost && isLive && !buyerLiveWalletReady);
  const buyerAuctionBidBlocked =
    roomType === "auction" && !isHost && isLive && activeLotBidPhase !== "bidding_open";
  const activeSaleMissingListing =
    roomType === "sale" && activeDb?.status === "active" && !activeDb.listingId;
  const activeHasVariants = Boolean(
    activeDb && isVariantSalesFormat(activeDb.salesFormat) && (activeDb.variants?.length ?? 0) > 0,
  );
  const activeVariantSpots = activeHasVariants ? summarizeVariantSpots(activeDb?.variants) : null;
  const variantSelectLabel = variantBuyerSelectLabel(activeDb?.salesFormat);

  const redirectSignIn = (returnPath: string) => {
    router.push(`/signin?returnTo=${encodeURIComponent(returnPath)}`);
  };

  const handleBuyNow = async () => {
    setActionError(null);
    if (!activeDb) {
      setActionError("Nothing is live to purchase yet.");
      return;
    }
    if (roomType !== "sale") return;
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    if (!activeDb.listingId) {
      setActionError("Checkout is not available for this slot.");
      return;
    }
    setBusy(true);
    try {
      const res = await purchaseLiveBuyNowWithSca({
        liveRoomId,
        itemId: activeDb.id,
      });
      if (!res.ok) {
        if (res.status === 401 && res.signInUrl) {
          router.push(res.signInUrl);
          return;
        }
        if (res.walletIncomplete) {
          setActionError(res.error);
          return;
        }
        setActionError(res.error);
        if (res.paymentFailed) void onRefetch?.();
        return;
      }
      setShipUxNonce((n) => n + 1);
      void onRefetch?.();
    } finally {
      setBusy(false);
    }
  };

  const handlePlaceBid = async () => {
    setActionError(null);
    if (roomType !== "auction" || !activeDb) {
      setActionError("Nothing is live to bid on yet.");
      return;
    }
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    if (activeLotBidPhase === "timer_ended_unsettled") {
      setActionError(LIVE_AUCTION_BUYER_TIMER_ENDED_COPY);
      return;
    }
    if (bidMeta?.auctionEnded) {
      setActionError("This auction has ended.");
      return;
    }
    const amount = Number(nextBidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Invalid bid amount.");
      return;
    }
    setBidFlight(true);
    const idempotencyKey = createLiveBidIdempotencyKey();
    try {
      const res = await fetch(
        `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(activeDb.id)}/bid`,
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
        console.debug("[live-auction-client] bid HTTP ACK (sale room)", ack);
      }
      onAuctionHttpAck?.(ack);
      toast("Bid placed.");
      const uid = session?.user?.id;
      if (uid && ack.item?.lastHighBidderId === uid) {
        setUserHighBidUsd(ack.item.currentBidUsd ?? amount);
      } else {
        setUserHighBidUsd(null);
      }
      setShipUxNonce((n) => n + 1);
      window.setTimeout(() => {
        void onRefetch?.();
        router.refresh();
      }, 750);
    } catch {
      toast("Could not place bid.");
    } finally {
      setBidFlight(false);
    }
  };

  const handleHostMarkSold = useCallback(async () => {
    if (!activeDb || activeLotBidPhase !== "timer_ended_unsettled") return;
    setHostMarkSoldBusy(true);
    setActionError(null);
    try {
      const r = await patchLiveRoomItemStatus(liveRoomId, activeDb.id, "sold");
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
  }, [activeDb, activeLotBidPhase, liveRoomId, onRefetch, router, toast]);

  const handleHostStartSaleAuction = useCallback(async () => {
    if (!activeDb || roomType !== "auction") return;
    setHostSaleAuctionBusy(true);
    setActionError(null);
    try {
      const res = await startLiveRoomItemAuction(liveRoomId, activeDb.id, hostSaleAuctionDurationSec, hostSaleClutchTimeEnabled);
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
      setHostSaleAuctionBusy(false);
    }
  }, [
    activeDb,
    hostSaleAuctionDurationSec,
    hostSaleClutchTimeEnabled,
    liveRoomId,
    onAuctionHttpAck,
    onRefetch,
    roomType,
    router,
    toast,
  ]);

  const handleShare = useCallback(async () => {
    const title = roomTitle?.trim() || liveTitle;
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
  }, [liveRoomId, liveTitle, roomTitle, toast]);

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

  const streamTitle = liveTitle;

  const priceLine =
    roomType === "sale"
      ? actionUi
        ? `${actionUi.displayTitle} · Buy now ${fmt(actionUi.buyNow)}`
        : "Select an item"
      : actionUi && activeOverlayPrice
        ? `${actionUi.displayTitle} · ${activeOverlayPrice.label} ${activeOverlayPrice.amountFormatted}`
        : actionUi
          ? `${actionUi.displayTitle} · Opening bid ${fmt(currentTopBid)}`
          : "Select an item";

  const desktopVideoOverlay = (
    <div className="live-desktop-action-hud p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Live action</p>
      <p
        className={`mt-1 text-lg font-black tabular-nums tracking-tight transition-colors duration-500 ease-[var(--live-ease)] ${
          roomType === "auction" && isWinning
            ? "text-gold-bright motion-safe:[animation:live-price-glow_2.8s_ease-in-out_infinite]"
            : "text-amber-100"
        }`}
      >
        {actionUi
          ? roomType === "auction" && activeOverlayPrice
            ? activeOverlayPrice.amountFormatted
            : fmt(currentTopBid)
          : "$0"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] font-medium text-zinc-200">{priceLine}</p>
      {!isHost && (roomType === "auction" || roomType === "sale") ? (
        <LiveShippingIndicator liveShowId={liveRoomId} refreshNonce={shipUxNonce} pollMs={isLive ? 8000 : 0} className="mt-2" />
      ) : null}
      {roomType === "auction" && isHost && activeDb?.status === "active" ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          {liveItemBiddingOpen && hostSaleAuctionCountdownLabel ? (
            <p className="text-[11px] font-black tabular-nums text-emerald-200">Time left {hostSaleAuctionCountdownLabel}</p>
          ) : null}
          {!isLive ? (
            <p className="text-[10px] text-amber-200/90">Go live first, then open bidding here.</p>
          ) : hostTimerEndedUnsettled ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-amber-200">{LIVE_AUCTION_HOST_TIMER_ENDED_COPY}</p>
              <button
                type="button"
                disabled={hostMarkSoldBusy}
                onClick={() => void handleHostMarkSold()}
                className="rounded-md bg-gold px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 shadow-sm transition hover:brightness-110 disabled:opacity-40"
              >
                {hostMarkSoldBusy ? "Settling…" : "Mark sold"}
              </button>
            </div>
          ) : liveItemBiddingOpen ? (
            <p className="text-[10px] text-emerald-200/90">Bidding is open on this lot.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <span className="font-semibold uppercase tracking-wide">Timer</span>
                <select
                  value={hostSaleAuctionDurationSec}
                  onChange={(e) => setHostSaleAuctionDurationSec(Number(e.target.value))}
                  className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-semibold text-zinc-100"
                >
                  {SALE_AUCTION_DURATION_CHOICES.map((c) => (
                    <option key={c.sec} value={c.sec}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-pressed={hostSaleClutchTimeEnabled}
                onClick={() => setHostSaleClutchTimeEnabled((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                  hostSaleClutchTimeEnabled
                    ? "border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-amber-400/25 text-white shadow-[0_0_18px_-8px_rgba(217,70,239,0.9)]"
                    : "border-white/20 bg-black/45 text-zinc-300 hover:border-white/35 hover:text-zinc-100"
                }`}
              >
                <span
                  className={`relative inline-flex h-4 w-7 items-center rounded-full border ${
                    hostSaleClutchTimeEnabled ? "border-fuchsia-200/70 bg-fuchsia-400/30" : "border-white/25 bg-black/50"
                  }`}
                >
                  <span
                    className={`absolute h-3 w-3 rounded-full bg-white transition ${
                      hostSaleClutchTimeEnabled ? "left-[14px]" : "left-[1px]"
                    }`}
                  />
                </span>
                <span>Clutch Time</span>
              </button>
              <button
                type="button"
                disabled={!hostSaleStartEnabled || hostSaleAuctionBusy}
                onClick={() => void handleHostStartSaleAuction()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hostSaleAuctionBusy ? "Starting…" : "Start"}
              </button>
            </div>
          )}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        {roomType === "auction" ? (
          <button
            data-testid="live-bid-button"
            type="button"
            disabled={
              actionsDisabled ||
              activeSaleMissingListing ||
              buyerAuctionBidBlocked ||
              (Boolean(activeListingId) && Boolean(bidMeta?.auctionEnded))
            }
            onClick={() => void handlePlaceBid()}
            className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] border border-emerald-300/50 bg-emerald-600/40 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:bg-emerald-600/55 active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            {`Place Bid $${nextBidAmount}`}
          </button>
        ) : null}
        {roomType === "sale" && activeHasVariants ? (
          <button
            type="button"
            disabled={actionsDisabled || activeDb?.status !== "active" || (activeVariantSpots?.available ?? 0) <= 0}
            onClick={() => setVariantSheetOpen(true)}
            className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            {variantSelectLabel}
          </button>
        ) : null}
        {roomType === "sale" && !activeHasVariants ? (
          <button
            type="button"
            disabled={actionsDisabled || !activeDb?.listingId || activeSaleMissingListing}
            onClick={() => void handleBuyNow()}
            className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            {busy ? "Working…" : "Buy Now"}
          </button>
        ) : null}
      </div>
      {activeSaleMissingListing ? (
        <p className="mt-2 text-[10px] font-medium text-amber-200/90">
          This live item is not linked to checkout yet. Ask the host in chat.
        </p>
      ) : null}
      <LiveBuyerWalletGateHint
        hide={isHost || !isLive || (roomType !== "auction" && roomType !== "sale")}
        paymentReady={payReady}
        shippingReady={shipReady}
      />
      {guestNeedsAuth ? (
        <p className="mt-2 text-[10px] text-zinc-400">
          <Link href={`/signin?returnTo=${encodeURIComponent(`/live/${encodeURIComponent(liveRoomId)}`)}`} className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to buy or bid.
        </p>
      ) : null}
      {roomType === "auction" && !isHost && activeLotBidPhase === "not_started" ? (
        <p className="mt-2 text-[10px] text-zinc-400">{LIVE_AUCTION_BUYER_NOT_STARTED_COPY}</p>
      ) : null}
      {roomType === "auction" && !isHost && activeLotBidPhase === "timer_ended_unsettled" ? (
        <p className="mt-2 text-[10px] font-medium text-amber-200/90">{LIVE_AUCTION_BUYER_TIMER_ENDED_COPY}</p>
      ) : null}
      {actionError ? <p className="mt-2 text-[10px] font-medium text-rose-300">{actionError}</p> : null}
    </div>
  );

  const mobileVideoOverlay = (
    <div className="live-glass-sheet relative min-h-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 max-[380px]:px-1.5 max-[380px]:pt-1.5">
      <p className="line-clamp-1 text-[11px] font-semibold leading-tight text-zinc-100">
        {actionUi ? actionUi.displayTitle : "Current item"}
      </p>
      <div className="mt-1 min-h-[1.35rem]">
        <p
          className={`text-[13px] font-black tabular-nums transition-colors duration-500 ease-[var(--live-ease)] ${
            roomType === "auction" && isWinning
              ? "text-gold-bright motion-safe:[animation:live-price-glow_2.8s_ease-in-out_infinite]"
              : roomType === "auction"
                ? "text-emerald-200/95"
                : "text-emerald-200"
          }`}
        >
          {actionUi
            ? roomType === "auction" && activeOverlayPrice
              ? `${activeOverlayPrice.label} ${activeOverlayPrice.amountFormatted}`
              : roomType === "sale"
                ? `${fmt(currentTopBid)} · price`
                : fmt(currentTopBid)
            : "Select an item"}
        </p>
        {roomType === "auction" && isWinning ? (
          <p className="text-[9px] font-semibold uppercase tracking-wide text-gold-bright/85">You&apos;re winning</p>
        ) : roomType === "auction" && activeDb ? (
          <p className="text-[10px] font-semibold text-zinc-300">
            {formatAuctionLeaderLine({
              lastHighBidderUsername: activeDb.lastHighBidderUsername,
              lastHighBidderId: activeDb.lastHighBidderId,
              currentBidUsd: activeDb.currentBidUsd,
              startingBidUsd: activeDb.startingBidUsd,
            })}
          </p>
        ) : null}
      </div>
      {!isHost && (roomType === "auction" || roomType === "sale") ? (
        <LiveShippingIndicator
          liveShowId={liveRoomId}
          refreshNonce={shipUxNonce}
          pollMs={isLive ? 8000 : 0}
          compact
          className="mt-2"
        />
      ) : null}
      {roomType === "auction" && isHost && activeDb?.status === "active" ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
          {liveItemBiddingOpen && hostSaleAuctionCountdownLabel ? (
            <p className="text-center text-[10px] font-black tabular-nums text-emerald-200">Time left {hostSaleAuctionCountdownLabel}</p>
          ) : null}
          {!isLive ? (
            <p className="text-center text-[9px] text-amber-200/90">Go live, then open bidding.</p>
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
          ) : liveItemBiddingOpen ? (
            <p className="text-center text-[9px] text-emerald-200/90">Bidding open</p>
          ) : (
            <>
              <label className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                <span className="font-bold uppercase tracking-wide">Timer</span>
                <select
                  value={hostSaleAuctionDurationSec}
                  onChange={(e) => setHostSaleAuctionDurationSec(Number(e.target.value))}
                  className="rounded-full border border-white/14 bg-black/50 px-2 py-1 text-[10px] font-semibold text-zinc-100"
                >
                  {SALE_AUCTION_DURATION_CHOICES.map((c) => (
                    <option key={c.sec} value={c.sec}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-pressed={hostSaleClutchTimeEnabled}
                onClick={() => setHostSaleClutchTimeEnabled((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition ${
                  hostSaleClutchTimeEnabled
                    ? "border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-500/25 via-violet-500/25 to-amber-400/25 text-white"
                    : "border-white/20 bg-black/45 text-zinc-300"
                }`}
              >
                <span
                  className={`relative inline-flex h-3.5 w-6 items-center rounded-full border ${
                    hostSaleClutchTimeEnabled ? "border-fuchsia-200/70 bg-fuchsia-400/30" : "border-white/25 bg-black/50"
                  }`}
                >
                  <span
                    className={`absolute h-2.5 w-2.5 rounded-full bg-white transition ${
                      hostSaleClutchTimeEnabled ? "left-[11px]" : "left-[1px]"
                    }`}
                  />
                </span>
                <span>Clutch Time</span>
              </button>
              <button
                type="button"
                disabled={!hostSaleStartEnabled || hostSaleAuctionBusy}
                onClick={() => void handleHostStartSaleAuction()}
                className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
              >
                {hostSaleAuctionBusy ? "…" : "Start"}
              </button>
            </>
          )}
        </div>
      ) : null}
      {roomType === "auction" ? (
        <div className="mt-2 flex min-h-10 items-center gap-1.5 max-[380px]:gap-1 md:min-h-11">
          <span
            className={`inline-flex min-h-10 min-w-[4.75rem] shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/40 px-1.5 text-[9px] font-bold tabular-nums tracking-tight max-[380px]:min-w-[4.25rem] md:min-h-11 md:min-w-[5.5rem] md:px-2 md:text-[10px] ${
              bidMeta?.auctionEnded
                ? "text-zinc-500"
                : countdownFinal
                  ? "text-rose-200/95 motion-safe:[animation:live-countdown-pulse_1.15s_ease-in-out_infinite] motion-reduce:[animation:none]"
                  : countdownUrgent
                    ? "text-amber-200/95"
                    : "text-zinc-200"
            }`}
          >
            {activeLotBidPhase === "timer_ended_unsettled" || bidMeta?.auctionEnded
              ? "Ended"
              : countdownLabel ?? "Live"}
          </span>
          <button
            data-testid="live-bid-button"
            type="button"
            disabled={
              actionsDisabled ||
              activeSaleMissingListing ||
              buyerAuctionBidBlocked ||
              (Boolean(activeListingId) && Boolean(bidMeta?.auctionEnded))
            }
            onClick={() => void handlePlaceBid()}
            aria-label={`Place bid ${nextBidAmount} dollars`}
            className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-r from-[#c9a227] via-[#e8d48b] to-[#fde68a] px-2 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_12px_30px_-14px_rgba(201,162,39,0.55)] transition-[transform,box-shadow,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 md:min-h-11 md:px-3 md:text-[11px]"
          >
            <span className="min-w-0 truncate">
              <span className="max-[380px]:hidden">Bid · </span>
              <span className="hidden max-[380px]:inline">Bid </span>
              <span className="tabular-nums">${nextBidAmount}</span>
            </span>
          </button>
        </div>
      ) : null}
      {roomType === "sale" && activeHasVariants ? (
        <button
          type="button"
          disabled={actionsDisabled || activeDb?.status !== "active" || (activeVariantSpots?.available ?? 0) <= 0}
          onClick={() => setVariantSheetOpen(true)}
          className="mt-2 min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
        >
          {variantSelectLabel}
        </button>
      ) : null}
      {roomType === "sale" && !activeHasVariants ? (
        <button
          type="button"
          disabled={actionsDisabled || !activeDb?.listingId || activeSaleMissingListing}
          onClick={() => void handleBuyNow()}
          className="mt-2 min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
        >
          {busy ? "Working…" : "Buy Now"}
        </button>
      ) : null}
      {activeSaleMissingListing ? (
        <p className="mt-1 text-[10px] font-medium text-amber-200/90">Checkout is not linked for this slot.</p>
      ) : null}
      <LiveBuyerWalletGateHint
        hide={isHost || !isLive || (roomType !== "auction" && roomType !== "sale")}
        paymentReady={payReady}
        shippingReady={shipReady}
        className="mt-1 text-[10px] text-amber-200/90"
      />
      {guestNeedsAuth ? (
        <p className="mt-1 text-[10px] text-zinc-400">
          <Link href={`/signin?returnTo=${encodeURIComponent(`/live/${encodeURIComponent(liveRoomId)}`)}`} className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to buy or bid.
        </p>
      ) : null}
      {roomType === "auction" && !isHost && activeLotBidPhase === "not_started" ? (
        <p className="mt-1 text-[10px] text-zinc-400">{LIVE_AUCTION_BUYER_NOT_STARTED_COPY}</p>
      ) : null}
      {roomType === "auction" && !isHost && activeLotBidPhase === "timer_ended_unsettled" ? (
        <p className="mt-1 text-[10px] font-medium text-amber-200/90">{LIVE_AUCTION_BUYER_TIMER_ENDED_COPY}</p>
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

  const hostConsoleRoomType = roomType === "break" ? "break" : roomType === "sale" ? "sale" : "auction";

  const videoStageProps = {
    overlayMessage: `Live · ${actionUi ? actionUi.displayTitle : "Current item"} · ${
      roomType === "auction" && activeOverlayPrice
        ? `${activeOverlayPrice.label} ${activeOverlayPrice.amountFormatted}`
        : fmt(currentTopBid)
    }`,
    viewers: viewerCount,
    hostName: hostDisplayName,
    streamTitle,
    isLive,
    roomStatus,
    liveRoomId,
    hostSellerId: sellerId,
    onBack: () => router.back(),
    centerOverlay: activeHasVariants && activeDb ? <LiveVariantSpotBoard item={activeDb} /> : undefined,
    onNotifyMe: () => redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`),
    streamPlaybackRefreshNonce,
    scheduledStartAt,
    thumbnailUrl,
    buyerShellMode: isBuyerDesktop,
    showRightActions: !isHost && !isBuyerDesktop,
    onShare: handleShare,
    onWallet: handleWallet,
    onTip: isLive && !isHost ? handleTip : undefined,
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-0 z-40 flex min-h-0 flex-col overflow-hidden overscroll-y-contain bg-black text-zinc-100 md:top-[var(--site-header-offset)]">
      {showOutbidToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[max(4.25rem,env(safe-area-inset-top)+2.75rem)] z-[70] w-[min(92vw,20rem)] -translate-x-1/2 motion-safe:animate-[live-chat-slide_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:animate-none"
        >
          <div className="rounded-full border border-[color:var(--live-border)] bg-black/50 px-4 py-2 text-center text-[11px] font-medium leading-snug text-zinc-100 shadow-[var(--live-shadow-toast)] backdrop-blur-[var(--live-blur-xl)]">
            Outbid — new high bid on this item
          </div>
        </div>
      ) : null}
      {isBuyerDesktop ? (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col overflow-hidden">
          <BuyerLiveDesktopShell
            hostStrip={
              <BuyerLiveHostStrip
                hostName={hostDisplayName}
                streamTitle={streamTitle}
                hostSellerId={sellerId}
                viewers={viewerCount}
                isLive={isLive}
                roomStatus={roomStatus}
                liveRoomId={liveRoomId}
                shopHref={shopHref}
                onBack={() => router.back()}
                onShare={handleShare}
                onWallet={handleWallet}
                onTip={isLive && !isHost ? handleTip : undefined}
              />
            }
            chat={embeddedDesktopChat}
            video={
              <LiveVideoStage
                {...videoStageProps}
                layout="buyerShellPlate"
                actionOverlay={null}
                mobileActionOverlay={null}
                chatOverlay={null}
              />
            }
            hostBanner={
              isHost ? <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType={hostConsoleRoomType} /> : undefined
            }
            commerce={<BuyerLiveDesktopCommerce>{desktopVideoOverlay}</BuyerLiveDesktopCommerce>}
            lineup={
              !isHost && queue.length > 0 ? (
                <BuyerLiveLineupPanel
                  items={queue.map((item) => ({
                    id: item.id,
                    displayTitle: item.displayTitle,
                    metaLine: roomType === "auction" ? `${fmt(item.topBid)} bid` : fmt(item.buyNow),
                  }))}
                  selectedId={selectedId}
                  shopHref={shopHref}
                  onSelect={setSelectedId}
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
                  actionOverlay={desktopVideoOverlay}
                  mobileActionOverlay={mobileVideoOverlay}
                  chatOverlay={floatingChatOverlay}
                />
              </div>

              {isHost ? (
                <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType={hostConsoleRoomType} />
              ) : queue.length > 0 ? (
                <BuyerLiveNextUpRail
                  nextTitle={buyerNextUpItem?.displayTitle ?? "More coming soon"}
                  nextMeta={
                    buyerNextUpItem
                      ? roomType === "auction"
                        ? `${fmt(buyerNextUpItem.topBid)} bid · ${queue.length} in lineup`
                        : `${fmt(buyerNextUpItem.buyNow)} · ${queue.length} in lineup`
                      : `${queue.length} in lineup`
                  }
                  queueCount={queue.length}
                  shopHref={shopHref}
                  onOpenQueue={() => setBuyerLineupOpen(true)}
                />
              ) : null}

              {!isHost && (roomType === "auction" || roomType === "sale") ? (
                <LiveShippingIndicator
                  liveShowId={liveRoomId}
                  refreshNonce={shipUxNonce}
                  pollMs={isLive ? 8000 : 0}
                  compact
                />
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
        subtitle={`${queue.length} item${queue.length === 1 ? "" : "s"} in queue`}
        shopHref={shopHref}
        footer={
          !isHost && (roomType === "auction" || roomType === "sale") ? (
            <LiveShippingIndicator
              liveShowId={liveRoomId}
              refreshNonce={shipUxNonce}
              pollMs={isLive ? 8000 : 0}
              compact
            />
          ) : undefined
        }
      >
        <BuyerLiveQueueList
          items={queue.map((item) => ({
            id: item.id,
            displayTitle: item.displayTitle,
            metaLine: roomType === "auction" ? `${fmt(item.topBid)} bid` : fmt(item.buyNow),
          }))}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setBuyerLineupOpen(false);
          }}
          emptyHint="Items added by the host will appear here."
        />
      </BuyerLiveQueueSheet>
      {activeDb && activeHasVariants ? (
        <LiveVariantSelectionSheet
          open={variantSheetOpen}
          onClose={() => setVariantSheetOpen(false)}
          item={activeDb}
          liveRoomId={liveRoomId}
          walletReady={buyerLiveWalletReady}
          onWalletRequired={() => setActionError("Add payment and shipping in Wallet before checkout.")}
          onPurchased={() => {
            setShipUxNonce((n) => n + 1);
            router.refresh();
          }}
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
