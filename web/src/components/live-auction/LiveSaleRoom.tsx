"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRealtimeListingBidsSubscription } from "@/hooks/useRealtimeListingBidsSubscription";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LiveAuctionChat } from "@/components/live-auction/LiveAuctionChat";
import { ExpandableLiveChatOverlay } from "@/components/live-auction/ExpandableLiveChatOverlay";
import { LiveBuyerWalletGateHint } from "@/components/live-auction/LiveBuyerWalletGateHint";
import { LiveVariantSelectionSheet } from "@/components/live-auction/LiveVariantSelectionSheet";
import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { LiveTipSheet } from "@/components/live-auction/LiveTipSheet";
import { BuyerLiveDesktopShell } from "@/components/live-auction/buyer/BuyerLiveDesktopShell";
import { BuyerLiveHostStrip } from "@/components/live-auction/buyer/BuyerLiveHostStrip";
import { BuyerLiveDesktopCommerce } from "@/components/live-auction/buyer/BuyerLiveDesktopCommerce";
import { BuyerLiveItemBoard } from "@/components/live-auction/buyer/BuyerLiveItemBoard";
import { BuyerLiveItemBoardOverlay } from "@/components/live-auction/buyer/BuyerLiveItemBoardOverlay";
import { BuyerVariantClaimCta } from "@/components/live-auction/buyer/BuyerVariantClaimCta";
import { BuyerLiveNextUpRail } from "@/components/live-auction/buyer/BuyerLiveNextUpRail";
import { BuyerLiveQueueList } from "@/components/live-auction/buyer/BuyerLiveQueueList";
import { BuyerLiveQueueSheet } from "@/components/live-auction/buyer/BuyerLiveQueueSheet";
import { BUYER_LIVE_MAIN_SECTION, BUYER_LIVE_PAGE_GRID } from "@/components/live-auction/buyer/buyerLiveLayout";
import { HostLiveRoomConsoleBanner } from "@/components/live-auction/buyer/HostLiveRoomConsoleBanner";
import { useBuyerLiveDesktop } from "@/components/live-auction/buyer/useBuyerLiveDesktop";
import { useLiveRoomModerationState } from "@/hooks/useLiveRoomModerationState";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { LiveGiveawaySideTab } from "@/components/live-auction/LiveGiveawaySideTab";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error-message";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import type { LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { liveAuctionMinBidUsd } from "@/lib/auction";
import {
  liveEventReminderSuccessMessage,
  setLiveEventReminder,
} from "@/lib/live-event-reminder";
import { liveAuctionDisplayBidUsd, resolvePinnedLotOverlayPrice } from "@/lib/live-auction-overlay-price";
import { LIVE_AUCTION_CLIENT_END_GRACE_MS } from "@/lib/live-auction-bid-extension";
import { projectBuyerQueueLineup, buyerQueueRowSelectable } from "@/lib/live-buyer-queue-projection";
import { fetchLiveBuyerPaymentSession } from "@/lib/live-tip-client";
import { createLiveBidIdempotencyKey, liveBidRequestHeaders } from "@/lib/live-bid-client";
import {
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
} from "@/lib/live-room-commerce-messages";
import {
  LIVE_AUCTION_BUYER_NOT_STARTED_COPY,
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
  LIVE_AUCTION_HOST_TIMER_ENDED_COPY,
  resolveLiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";
import { finalizeOverdueLiveAuctions, patchLiveRoomItemStatus, patchLiveItemVariants, startLiveRoomItemAuction } from "@/lib/live-room-control-client";
import { syncedWallTimeMs } from "@/lib/server-clock-sync";
import { liveBidMetaFallbackPollMs } from "@/lib/live-fallback-poll-intervals";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { logAuctionTimer } from "@/lib/auction-timer-sync";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { LiveRoomShareSheet } from "@/components/live-auction/LiveRoomShareSheet";
import { formatAuctionLeaderLine } from "@/lib/live-auction-winner-display";
import type { VariantPurchasedMergePayload } from "@/lib/live-room-variant-merge";
import { isVariantSalesFormat, summarizeVariantSpots, variantBuyerSelectLabel, variantClaimPrimaryLabel, hostPinnedBuyerVariant, isRandomVariantAssignment, buildExclusiveHostPinUpdates } from "@/lib/live-item-variant-presets";
import {
  isVariantSpotAuctionLive,
  pinnedVariantAuctionPrimaryLabel,
  shopAvailableSpotCount,
  shopAvailableVariants,
} from "@/lib/live-variant-spot-commerce";
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
  roomCategory?: string;
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
  giveaways?: ViewerGiveawayDTO[];
  onOpenWallet: () => void;
  onApplyVariantPurchase?: (payload: VariantPurchasedMergePayload & { label?: string; amountUsd?: number }) => void;
  buyerPaymentRecoveryPending?: boolean;
  broadcastCommerceBlocked?: boolean;
  broadcastCommerceHint?: string | null;
};

export function LiveSaleRoom({
  roomId: _roomId,
  roomTitle,
  roomCategory,
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
  giveaways = [],
  onOpenWallet,
  onApplyVariantPurchase,
  buyerPaymentRecoveryPending = false,
  broadcastCommerceBlocked = false,
  broadcastCommerceHint = null,
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

  const autoCloseNudgedItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (roomType !== "auction") return;
    const active = dbItems.find((x) => x.status === "active");
    if (!active?.biddingOpen || !active.auctionEndsAt) return;
    const endsMs = Date.parse(active.auctionEndsAt);
    if (!Number.isFinite(endsMs)) return;
    if (syncedWallTimeMs(clockSkewMs) < endsMs + 1500) return;
    if (autoCloseNudgedItemRef.current === active.id) return;
    autoCloseNudgedItemRef.current = active.id;
    void finalizeOverdueLiveAuctions(liveRoomId).then(() => onRefetch?.());
  }, [clockSkewMs, dbItems, liveAuctionResolutionTick, liveRoomId, onRefetch, roomType]);

  const mapped = useMemo(
    () => dbItems.map((i) => mapDbItem(i, isLive, clockSkewMs, roomType)),
    [dbItems, isLive, liveAuctionResolutionTick, clockSkewMs],
  );
  const [items, setItems] = useState<SaleItem[]>(mapped);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinVariantBusy, setPinVariantBusy] = useState(false);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [variantSheetInitialVariantId, setVariantSheetInitialVariantId] = useState<string | null>(null);
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
  const [shareOpen, setShareOpen] = useState(false);
  const [roomPaymentMethodId, setRoomPaymentMethodId] = useState<string | null>(null);
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

  const buyerCurrentHighUsd = useMemo(() => {
    if (roomType !== "auction" || !activeDb) return null;
    return liveAuctionDisplayBidUsd({
      currentBidUsd: activeDb.currentBidUsd,
      startingBidUsd: activeDb.startingBidUsd,
      lastHighBidderId: activeDb.lastHighBidderId,
      lastHighBidderUsername: activeDb.lastHighBidderUsername,
    });
  }, [roomType, activeDb]);

  useEffect(() => {
    if (roomType !== "auction") return;
    const cur = buyerCurrentHighUsd ?? bidMeta?.currentBidUsd;
    const mine = userHighBidUsd;
    if (mine == null || cur == null) return;
    if (cur > mine + 0.01) {
      setShowOutbidToast(true);
      setUserHighBidUsd(null);
      const t = window.setTimeout(() => setShowOutbidToast(false), 3200);
      return () => window.clearTimeout(t);
    }
  }, [roomType, buyerCurrentHighUsd, bidMeta?.currentBidUsd, userHighBidUsd]);

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
      return resolvePinnedLotOverlayPrice({
        commerceMode: "buy_now",
        priceUsd: activeDb.priceUsd,
      });
    }
    return resolvePinnedLotOverlayPrice({
      salesFormat: activeDb.salesFormat,
      variants: activeDb.variants,
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
    (buyerCurrentHighUsd ?? bidMeta?.currentBidUsd) != null &&
    !bidMeta?.auctionEnded &&
    Math.abs((buyerCurrentHighUsd ?? bidMeta?.currentBidUsd)! - userHighBidUsd) < 0.02;

  const queue = items.filter((i) => i.status !== "sold" && i.status !== "skipped");
  const buyerQueueRows = useMemo(
    () =>
      projectBuyerQueueLineup(dbItems, {
        roomIsLive: isLive,
        clockSkewMs,
        nowMs: syncedWallTimeMs(clockSkewMs),
      }),
    [dbItems, isLive, clockSkewMs, liveAuctionResolutionTick, clockTick],
  );
  const buyerNextUpItem = useMemo(() => {
    const active = queue.find((i) => i.status === "live" || i.id === selectedId);
    return queue.find((i) => i.id !== active?.id) ?? queue[0] ?? null;
  }, [queue, selectedId]);

  const isHost = Boolean(session?.user?.id && session.user.id === sellerId);
  const viewerModeration = useLiveRoomModerationState(liveRoomId, Boolean(liveRoomId));
  const staffCommerceBlocked = isHost || viewerModeration.isModerator;

  useEffect(() => {
    if (status !== "authenticated" || isHost || !liveRoomId) return;
    void fetchLiveBuyerPaymentSession(liveRoomId).then((session) => {
      const nextId = session?.activePaymentMethodId?.trim() || null;
      if (nextId) setRoomPaymentMethodId(nextId);
    });
  }, [isHost, liveRoomId, status]);
  const payReady = buyerLiveBidPaymentReady !== false;
  const shipReady = buyerLiveShippingReady !== false;
  const buyerLiveWalletReady = payReady && shipReady;

  /** Listing min/next + leader come from `/api/listings/.../bids`; poll while the lot is open so buyers stay in sync if realtime drops. */
  useEffect(() => {
    if (roomType !== "auction" || !isLive || isHost) return;
    if (!activeDb?.listingId) return;
    if (activeDb.status !== "active" || !activeDb.biddingOpen || !activeDb.auctionEndsAt) return;
    const hasRealtime = Boolean(getSupabaseBrowserClient());
    const pollMs = liveBidMetaFallbackPollMs(hasRealtime);
    const id = window.setInterval(() => void refetchBidMeta(), pollMs);
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
  const sessionPending = status === "loading" && !isHost && isLive;
  const sessionBlocksBuyer = status === "unauthenticated" && !isHost && isLive;
  const activeHasVariants = Boolean(
    activeDb && isVariantSalesFormat(activeDb.salesFormat) && (activeDb.variants?.length ?? 0) > 0,
  );
  const pytCommerceLive = Boolean(activeHasVariants && isLive && activeDb?.status === "active");
  const activeVariantSpots = activeHasVariants ? summarizeVariantSpots(activeDb?.variants) : null;
  const buyerPinnedVariant = useMemo(() => {
    if (!activeDb?.variants?.length) return null;
    if (isRandomVariantAssignment(activeDb.variantAssignmentMode)) return null;
    return hostPinnedBuyerVariant(activeDb.variants, activeDb.variantAssignmentMode);
  }, [activeDb]);
  const spotAuctionLive = Boolean(activeDb && isVariantSpotAuctionLive(activeDb));
  const shopVariantSpots = activeHasVariants && activeDb
    ? summarizeVariantSpots(shopAvailableVariants(activeDb))
    : null;
  const shoppableSpotCount = activeHasVariants && activeDb ? shopAvailableSpotCount(activeDb) : 0;
  const variantSelectLabel = activeDb
    ? isVariantSpotAuctionLive(activeDb)
      ? pinnedVariantAuctionPrimaryLabel(
          activeDb.salesFormat,
          liveAuctionMinBidUsd(activeDb) ?? activeDb.currentBidUsd ?? activeDb.startingBidUsd ?? buyerPinnedVariant?.priceUsd ?? 1,
        )
      : isRandomVariantAssignment(activeDb.variantAssignmentMode)
        ? variantBuyerSelectLabel(activeDb.salesFormat, true)
        : shoppableSpotCount > 0
          ? variantClaimPrimaryLabel(activeDb.salesFormat)
          : "Sold out"
    : "Select spot";
  const hybridSpotCommerce =
    spotAuctionLive && (shopVariantSpots?.available ?? 0) > 0 && activeLotBidPhase === "bidding_open";
  const variantShopLabel = activeDb ? variantClaimPrimaryLabel(activeDb.salesFormat) : "Claim spot";
  const actionsDisabled =
    !isLive ||
    broadcastCommerceBlocked ||
    staffCommerceBlocked ||
    busy ||
    bidFlight ||
    sessionPending ||
    sessionBlocksBuyer ||
    ((roomType === "auction" || roomType === "sale") && !isHost && isLive && !buyerLiveWalletReady && !activeHasVariants);
  const staffCommerceHint = broadcastCommerceHint
    ? broadcastCommerceHint
    : staffCommerceBlocked
    ? isHost
      ? LIVE_HOST_SELF_COMMERCE_ERROR
      : viewerModeration.isModerator
        ? LIVE_MODERATOR_COMMERCE_ERROR
        : null
    : null;
  const variantShopDisabled =
    !isLive ||
    broadcastCommerceBlocked ||
    staffCommerceBlocked ||
    busy ||
    sessionBlocksBuyer ||
    activeDb?.status !== "active" ||
    shoppableSpotCount <= 0;

  const variantSpotBidDisabled =
    !isLive ||
    broadcastCommerceBlocked ||
    staffCommerceBlocked ||
    busy ||
    bidFlight ||
    sessionBlocksBuyer ||
    activeDb?.status !== "active" ||
    (spotAuctionLive && activeLotBidPhase !== "bidding_open");

  const variantPickerDisabled = spotAuctionLive ? variantSpotBidDisabled : variantShopDisabled;

  const handleHostPinLiveVariant = useCallback(
    async (variantId: string) => {
      if (!activeDb?.variants?.length) return;
      setPinVariantBusy(true);
      setActionError(null);
      try {
        const updates = buildExclusiveHostPinUpdates(activeDb.variants, variantId);
        const res = await patchLiveItemVariants(liveRoomId, activeDb.id, updates);
        if (!res.ok) {
          setActionError(res.error);
          toast(res.error);
          return;
        }
        await onRefetch?.();
        router.refresh();
      } finally {
        setPinVariantBusy(false);
      }
    },
    [activeDb, liveRoomId, onRefetch, router, toast],
  );

  const buyerAuctionBidBlocked =
    roomType === "auction" && !isHost && isLive && activeLotBidPhase !== "bidding_open";
  const activeSaleMissingListing =
    roomType === "sale" && activeDb?.status === "active" && !activeDb.listingId;

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
    if (!activeDb) {
      setActionError("Nothing is live to bid on yet.");
      return;
    }
    if (roomType !== "auction" && !isVariantSpotAuctionLive(activeDb)) {
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
          credentials: "include",
          body: JSON.stringify({ amountUsd: amount }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        signInUrl?: string;
        code?: string;
        minNextBidUsd?: number;
      };
      if (res.status === 401) {
        if (data.signInUrl) router.push(data.signInUrl);
        else redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
        return;
      }
      if (!res.ok) {
        const msg = toUserFacingErrorMessage(data.error, "We couldn't place that bid. Try again in a moment.");
        setActionError(msg);
        toast(msg);
        // A rejected bid (outbid, min-bid moved, lot state changed) leaves local bid state
        // stale until the next realtime event or poll — resync now so the next attempt uses
        // current numbers instead of retrying against outdated state.
        void onRefetch?.();
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
      // ACK + realtime already updated local state — no delayed full refresh on the hot path.
    } catch {
      toast("We couldn't place that bid. Try again in a moment.");
      // Network error / timeout: the request may or may not have gone through server-side —
      // resync so the UI reflects reality instead of trusting the pre-bid local state.
      void onRefetch?.();
    } finally {
      setBidFlight(false);
    }
  };

  const handleOpenVariantShop = useCallback(() => {
    if (!activeDb || !pytCommerceLive) return;
    setVariantSheetInitialVariantId(null);
    setVariantSheetOpen(true);
  }, [activeDb, pytCommerceLive]);

  const handleBuyerVariantCommerce = useCallback(async () => {
    if (!activeDb || !pytCommerceLive) return;
    if (isVariantSpotAuctionLive(activeDb)) {
      await handlePlaceBid();
      return;
    }
    setVariantSheetInitialVariantId(buyerPinnedVariant?.id ?? null);
    setVariantSheetOpen(true);
  }, [activeDb, buyerPinnedVariant?.id, handlePlaceBid, pytCommerceLive]);

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

  const handleShare = useCallback(() => {
    setShareOpen(true);
  }, []);

  const handleWallet = useCallback(() => {
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    onOpenWallet();
  }, [liveRoomId, onOpenWallet, status]);

  const handleTip = useCallback(() => {
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    if (!isLive) {
      toast("Tips are available when the show is live.");
      return;
    }
    if (buyerPaymentRecoveryPending) {
      toast("Fix your failed payment before tipping in this show.");
      return;
    }
    setTipOpen(true);
  }, [buyerPaymentRecoveryPending, isLive, liveRoomId, status, toast]);

  const streamTitle = liveTitle;

  const handleNotifyMe = async () => {
    if (status !== "authenticated") {
      redirectSignIn(`/live/${encodeURIComponent(liveRoomId)}`);
      return;
    }
    const result = await setLiveEventReminder({
      liveRoomId,
      roomTitle: streamTitle,
      hostSellerId: sellerId,
      hostName: hostDisplayName,
    });
    if (result.ok) {
      toast(
        liveEventReminderSuccessMessage(
          { liveRoomId, roomTitle: streamTitle, hostSellerId: sellerId, hostName: hostDisplayName },
          Boolean(result.alreadySet),
        ),
      );
      return;
    }
    toast(result.error ?? "Could not set reminder.");
  };

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
      {!isHost && (roomType === "auction" || roomType === "sale") && !activeHasVariants ? (
        <LiveShippingIndicator
          liveShowId={liveRoomId}
          previewLiveRoomItemId={activeDb?.id}
          refreshNonce={shipUxNonce}
          pollMs={isLive ? 8000 : 0}
          className="mt-2"
        />
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
            className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            {`Place bid $${nextBidAmount}`}
          </button>
        ) : null}
        {activeHasVariants && !isHost ? (
          hybridSpotCommerce ? (
            <>
              <button
                data-testid="live-variant-claim-button"
                type="button"
                disabled={variantShopDisabled}
                onClick={() => handleOpenVariantShop()}
                className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
              >
                {variantShopLabel}
              </button>
              <button
                data-testid="live-bid-button"
                type="button"
                disabled={variantSpotBidDisabled}
                onClick={() => void handlePlaceBid()}
                className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
              >
                {variantSelectLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={variantPickerDisabled}
              onClick={() => void handleBuyerVariantCommerce()}
              className="flex-1 min-h-10 rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
            >
              {variantSelectLabel}
            </button>
          )
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
        hide={isHost || !isLive || (activeHasVariants ? buyerLiveWalletReady : false)}
        paymentReady={payReady}
        shippingReady={shipReady}
        onOpenWallet={onOpenWallet}
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
      {!actionError && staffCommerceHint ? (
        <p className="mt-2 text-[10px] font-medium text-amber-200/90">{staffCommerceHint}</p>
      ) : null}
    </div>
  );

  const showSaleActiveOverlay = roomStatus !== "ended" && activeDb?.status === "active";

  const desktopWaitingOverlay = (
    <div className="live-desktop-action-hud live-desktop-action-hud--compact px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Up next</p>
          <p className="line-clamp-1 text-xs font-bold leading-tight text-zinc-50">
            {buyerNextUpItem?.displayTitle ?? queue[0]?.displayTitle ?? "Lineup"}
          </p>
        </div>
        <p className="shrink-0 text-[10px] font-medium tabular-nums text-zinc-300">
          {buyerNextUpItem
            ? roomType === "auction"
              ? `${fmt(buyerNextUpItem.topBid)} bid`
              : fmt(buyerNextUpItem.buyNow)
            : `${queue.length} in queue`}
          {buyerNextUpItem ? ` · ${queue.length} in queue` : ""}
        </p>
      </div>
      <p className="mt-1 line-clamp-1 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
        {!isLive ? "Waiting for host to go live" : "Waiting for next lot"}
        <span className="font-normal normal-case tracking-normal text-zinc-500">
          {" · "}
          {!isLive ? "Purchases open when the show starts" : "Host will bring the next item shortly"}
        </span>
      </p>
    </div>
  );

  const desktopStageOverlay =
    showSaleActiveOverlay
      ? desktopVideoOverlay
      : queue.length > 0 && roomStatus !== "ended"
        ? desktopWaitingOverlay
        : null;

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
      {!isHost && (roomType === "auction" || roomType === "sale") && !activeHasVariants ? (
        <LiveShippingIndicator
          liveShowId={liveRoomId}
          previewLiveRoomItemId={activeDb?.id}
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
            className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-2 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,box-shadow,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 md:min-h-11 md:px-3 md:text-[11px]"
          >
            <span className="min-w-0 truncate">
              <span className="max-[380px]:hidden">Place bid </span>
              <span className="hidden max-[380px]:inline">Bid </span>
              <span className="tabular-nums">${nextBidAmount}</span>
            </span>
          </button>
        </div>
      ) : null}
      {pytCommerceLive && !isHost ? (
        hybridSpotCommerce ? (
          <div className="mt-2 flex gap-2">
            <button
              data-testid="live-variant-claim-button"
              type="button"
              disabled={variantShopDisabled}
              onClick={() => handleOpenVariantShop()}
              className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
            >
              {variantShopLabel}
            </button>
            <button
              data-testid="live-bid-button"
              type="button"
              disabled={variantSpotBidDisabled}
              onClick={() => void handlePlaceBid()}
              className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 text-[10px] font-black uppercase tracking-wide text-white transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
            >
              {variantSelectLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={variantPickerDisabled}
            onClick={() => void handleBuyerVariantCommerce()}
            className="mt-2 min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
          >
            {variantSelectLabel}
          </button>
        )
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
        hide={isHost || !isLive || (roomType !== "auction" && roomType !== "sale") || activeHasVariants}
        paymentReady={payReady}
        shippingReady={shipReady}
        className="mt-1 text-[10px] text-amber-200/90"
        onOpenWallet={onOpenWallet}
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
      {!actionError && staffCommerceHint ? (
        <p className="mt-1 text-[10px] font-medium text-amber-200/90">{staffCommerceHint}</p>
      ) : null}
    </div>
  );

  const buyerDesktopCommerceOverlay =
    isBuyerDesktop && activeHasVariants && !isHost ? (
      <BuyerLiveDesktopCommerce>{mobileVideoOverlay}</BuyerLiveDesktopCommerce>
    ) : (
      desktopVideoOverlay
    );

  const desktopItemBoardCommerce =
    showSaleActiveOverlay
      ? isBuyerDesktop
        ? buyerDesktopCommerceOverlay
        : mobileVideoOverlay
      : roomStatus !== "ended"
        ? (
            <div className="live-glass-sheet relative min-h-0 px-2 pb-2 pt-2">
              {desktopWaitingOverlay}
            </div>
          )
        : null;

  const buyerVariantClaimActions =
    pytCommerceLive && !isHost ? (
      hybridSpotCommerce ? (
        <div className="flex gap-2">
          <BuyerVariantClaimCta
            label={variantShopLabel}
            disabled={variantShopDisabled}
            onClick={() => handleOpenVariantShop()}
            className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-gold to-gold-bright px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_22px_-8px_rgba(212,175,55,0.55)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
          />
          <button
            data-testid="live-bid-button"
            type="button"
            disabled={variantSpotBidDisabled}
            onClick={() => void handlePlaceBid()}
            className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100 md:min-h-11 md:text-[11px]"
          >
            {variantSelectLabel}
          </button>
        </div>
      ) : (
        <BuyerVariantClaimCta
          label={variantSelectLabel}
          disabled={variantPickerDisabled}
          onClick={() => void handleBuyerVariantCommerce()}
        />
      )
    ) : undefined;

  const desktopItemBoardOverlay = desktopItemBoardCommerce ? (
    <BuyerLiveItemBoardOverlay commerce={desktopItemBoardCommerce} />
  ) : null;

  const floatingChatOverlay = (
    <ExpandableLiveChatOverlay>
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
    </ExpandableLiveChatOverlay>
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

  const giveawaySideTab =
    !isHost && isLive && giveaways.length > 0 ? (
      <LiveGiveawaySideTab
        liveRoomId={liveRoomId}
        giveaways={giveaways}
        signedIn={Boolean(session?.user?.id)}
        onRequireSignIn={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/live/${liveRoomId}`)}`)}
        onEntered={() => void onRefetch?.()}
        onTimerExpired={() => void onRefetch?.()}
      />
    ) : null;

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
    centerOverlay:
      isHost && activeHasVariants && activeDb ? (
        <LiveVariantSpotBoard
          item={activeDb}
          hostMode
          onPinVariant={
            activeDb.status === "active" && !isRandomVariantAssignment(activeDb.variantAssignmentMode)
              ? handleHostPinLiveVariant
              : undefined
          }
          pinBusy={pinVariantBusy}
        />
      ) : undefined,
    onNotifyMe: () => void handleNotifyMe(),
    streamPlaybackRefreshNonce,
    viewerAuthenticated: status === "authenticated",
    scheduledStartAt,
    thumbnailUrl,
    buyerShellMode: isBuyerDesktop,
    showRightActions: !isHost,
    shopHref,
    onShare: handleShare,
    onWallet: handleWallet,
    onTip: isLive && !isHost && !buyerPaymentRecoveryPending ? handleTip : undefined,
    giveawaySideTab,
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
                isLive={isLive}
                roomStatus={roomStatus}
                onBack={() => router.back()}
              />
            }
            chat={embeddedDesktopChat}
            video={
              <LiveVideoStage
                {...videoStageProps}
                layout="buyerShellPlate"
                actionOverlay={desktopItemBoardOverlay}
                mobileActionOverlay={null}
                chatOverlay={null}
              />
            }
            hostBanner={
              isHost ? <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType={hostConsoleRoomType} /> : undefined
            }
            itemBoard={
              !isHost ? (
                <BuyerLiveItemBoard
                  items={buyerQueueRows.map((item) => ({
                    id: item.id,
                    displayTitle: item.displayTitle,
                    metaLine: item.metaLine,
                    selectable: buyerQueueRowSelectable(item),
                  }))}
                  selectedId={selectedId}
                  shopHref={shopHref}
                  onSelect={setSelectedId}
                  actions={buyerVariantClaimActions}
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
              ) : buyerQueueRows.length > 0 ? (
                <BuyerLiveNextUpRail
                  nextTitle={buyerNextUpItem?.displayTitle ?? buyerQueueRows[0]?.displayTitle ?? "More coming soon"}
                  nextMeta={
                    (() => {
                      const row =
                        buyerQueueRows.find((r) => r.id === buyerNextUpItem?.id) ??
                        buyerQueueRows.find((r) => !r.isPinned) ??
                        buyerQueueRows[0];
                      return row
                        ? `${row.metaLine} · ${buyerQueueRows.length} in lineup`
                        : `${buyerQueueRows.length} in lineup`;
                    })()
                  }
                  queueCount={buyerQueueRows.length}
                  shopHref={shopHref}
                  onOpenQueue={() => setBuyerLineupOpen(true)}
                />
              ) : null}

              {!isHost && (roomType === "auction" || roomType === "sale") && !activeHasVariants ? (
                <LiveShippingIndicator
          liveShowId={liveRoomId}
          previewLiveRoomItemId={activeDb?.id}
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
        subtitle={`${buyerQueueRows.length} item${buyerQueueRows.length === 1 ? "" : "s"} in queue`}
        shopHref={shopHref}
        footer={
          !isHost && (roomType === "auction" || roomType === "sale") && !activeHasVariants ? (
            <LiveShippingIndicator
          liveShowId={liveRoomId}
          previewLiveRoomItemId={activeDb?.id}
          refreshNonce={shipUxNonce}
              pollMs={isLive ? 8000 : 0}
              compact
            />
          ) : undefined
        }
      >
        <BuyerLiveQueueList
          items={buyerQueueRows.map((item) => ({
            id: item.id,
            displayTitle: item.displayTitle,
            metaLine: item.metaLine,
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
          onClose={() => {
            setVariantSheetOpen(false);
            setVariantSheetInitialVariantId(null);
          }}
          item={activeDb}
          liveRoomId={liveRoomId}
          walletReady={buyerLiveWalletReady}
          initialVariantId={variantSheetInitialVariantId}
          excludeVariantIds={
            spotAuctionLive && activeDb.auctionVariantId
              ? [activeDb.auctionVariantId]
              : undefined
          }
          onWalletRequired={() => {
            setVariantSheetOpen(false);
            onOpenWallet();
          }}
          onPurchased={(payload) => {
            onApplyVariantPurchase?.(payload);
            setShipUxNonce((n) => n + 1);
            router.refresh();
          }}
        />
      ) : null}
      <LiveTipSheet
        open={tipOpen}
        onClose={() => setTipOpen(false)}
        liveRoomId={liveRoomId}
        paymentMethodId={roomPaymentMethodId}
        onPaymentMethodIdChange={setRoomPaymentMethodId}
        onOpenWallet={() => {
          setTipOpen(false);
          onOpenWallet();
        }}
        onSuccess={() => toast("Tip sent — thanks for supporting the show!")}
        onError={(msg) => toast(msg)}
      />
      <LiveRoomShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={liveRoomId}
        showTitle={roomTitle?.trim() || liveTitle}
        hostUsername={sellerShopUsername ?? hostDisplayName.replace(/^@+/, "")}
        isLive={isLive}
        category={roomCategory}
        canNotifyFollowers={isHost}
        onToast={toast}
      />
    </div>
  );
}
