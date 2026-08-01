"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BreakBuyerOverview } from "@/components/live-auction/BreakBuyerOverview";
import { BuyerBreakPaymentPrompt } from "@/components/live-auction/BuyerBreakPaymentPrompt";
import { BreakDisclaimerModal, breakDisclaimerStorageKey } from "@/components/live-auction/BreakDisclaimerModal";
import { LiveBuyerWalletGateHint } from "@/components/live-auction/LiveBuyerWalletGateHint";
import { LiveVariantSelectionSheet } from "@/components/live-auction/LiveVariantSelectionSheet";
import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { LiveAuctionChat } from "@/components/live-auction/LiveAuctionChat";
import { ExpandableLiveChatOverlay } from "@/components/live-auction/ExpandableLiveChatOverlay";
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
import {
  formatLiveVariantCheckoutHudMeta,
  useLiveVariantCheckoutPreview,
} from "@/hooks/useLiveVariantCheckoutPreview";
import { formatPinnedShippingTaxLine } from "../../../../shared/live-pinned-shipping-tax-copy";
import { LiveVideoStage } from "@/components/live-auction/LiveVideoStage";
import { LiveGiveawaySideTab } from "@/components/live-auction/LiveGiveawaySideTab";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import { TeamBoardChromeButton } from "@/components/team-board/TeamBoardChromeButton";
import { TeamBoardOverlay } from "@/components/team-board/TeamBoardOverlay";
import type { LiveRoomBreakPublicDTO, LiveRoomItemDTO, LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import type { VariantPurchasedMergePayload } from "@/lib/live-room-variant-merge";
import type { LiveRoomStatus } from "@/generated/prisma/client";
import { parseTeamBoardPublicPayload, type TeamBoardPublicPayload } from "@/lib/team-board-public";
import { liveAuctionMinBidUsd } from "@/lib/auction";
import {
  liveEventReminderSuccessMessage,
  setLiveEventReminder,
} from "@/lib/live-event-reminder";
import { liveAuctionDisplayBidUsd } from "@/lib/live-auction-overlay-price";
import { formatAuctionLeaderLine } from "@/lib/live-auction-winner-display";
import { LIVE_AUCTION_CLIENT_END_GRACE_MS } from "@/lib/live-auction-bid-extension";
import { projectBuyerQueueLineup, buyerQueueRowSelectable } from "@/lib/live-buyer-queue-projection";
import { fetchLiveBuyerPaymentSession } from "@/lib/live-tip-client";
import { createLiveBidIdempotencyKey, liveBidRequestHeaders } from "@/lib/live-bid-client";
import {
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
} from "@/lib/live-room-commerce-messages";
import {
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
  LIVE_AUCTION_HOST_TIMER_ENDED_COPY,
  resolveLiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";
import { canHostStartLiveAuction } from "@/lib/live-auction-host-start";
import { finalizeOverdueLiveAuctions, patchLiveRoomItemStatus, patchLiveItemVariants, startLiveRoomItemAuction } from "@/lib/live-room-control-client";
import { sellerProfilePath } from "@/lib/seller-profile-url";
import { LiveRoomShareSheet } from "@/components/live-auction/LiveRoomShareSheet";
import { syncedWallTimeMs } from "@/lib/server-clock-sync";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error-message";
import { isVariantSalesFormat, isVariantPurchaseItem, summarizeVariantSpots, variantBuyerSelectLabel, variantClaimPrimaryLabel, hostPinnedBuyerVariant, isRandomVariantAssignment, buildExclusiveHostPinUpdates } from "@/lib/live-item-variant-presets";
import {
  isVariantSpotAuctionLive,
  pinnedVariantAuctionPrimaryLabel,
  shopAvailableSpotCount,
  shopAvailableVariants,
} from "@/lib/live-variant-spot-commerce";
import { loadStripe } from "@stripe/stripe-js";
import { resolvePinnedLotOverlayPrice } from "@/lib/live-auction-overlay-price";
import {
  LIVE_CUSTOM_BID_DEFAULT_MODE,
  LIVE_CUSTOM_BID_MODE_COPY,
  resolveLiveCustomBidPayload,
  type LiveCustomBidMode,
} from "@/lib/live-custom-bid";

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

  if (isVariantPurchaseItem(i)) {
    const spotStats = summarizeVariantSpots(i.variants);
    const price = resolvePinnedLotOverlayPrice({
      salesFormat: i.salesFormat,
      variants: i.variants,
      status: i.status,
    });
    const fromUsd =
      spotStats.fromPriceUsd ??
      (price.amountUsd != null && Number.isFinite(price.amountUsd) ? price.amountUsd : null) ??
      i.priceUsd ??
      1;
    const status: SaleItem["status"] =
      i.status === "sold"
        ? "sold"
        : i.status === "skipped"
          ? "skipped"
          : i.status === "active"
            ? roomIsLive
              ? "live"
              : "posted"
            : "queued";
    return {
      id: i.id,
      title: i.title,
      displayTitle: i.displayTitle ?? i.title,
      progressLabel: i.progressLabel ?? null,
      quantity: spotStats.available,
      imageUrl: i.imageUrl,
      buyNow: fromUsd,
      topBid: fromUsd,
      bids: 0,
      status,
    };
  }

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
  roomCategory?: string;
  /** Unlisted private shows cannot blast followers from the share sheet. */
  discoveryVisibility?: "public" | "private";
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
  /** Short looping promo for scheduled rooms. */
  teaserVideoUrl?: string | null;
  /** Estimated server − client clock skew (ms); keeps countdown aligned with server auction end. */
  clockSkewMs?: number;
  /** When `false`, non-host buyers cannot bid until they add a saved card (server also enforces on POST). */
  buyerLiveBidPaymentReady?: boolean;
  /** When `false`, non-host buyers need a shipping address in Wallet (server enforces on POST). */
  buyerLiveShippingReady?: boolean;
  giveaways?: ViewerGiveawayDTO[];
  onOpenWallet: () => void;
  /** Instant PYT spot inventory merge after buyer checkout (before realtime round-trip). */
  onApplyVariantPurchase?: (payload: VariantPurchasedMergePayload & { label?: string; amountUsd?: number }) => void;
  /** Buyer must resolve payment recovery before commerce or tips. */
  buyerPaymentRecoveryPending?: boolean;
  /** Host IVS broadcast offline/paused — block buyer bids and checkout. */
  broadcastCommerceBlocked?: boolean;
  /** Offline-only — host pause does not block Buy Now / spots / shop. */
  broadcastPurchaseBlocked?: boolean;
  broadcastCommerceHint?: string | null;
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
    typeof (itemCandidate as { id?: unknown }).id === "string"
      ? (itemCandidate as LiveRoomItemDTO)
      : undefined;
  return { serverNowMs, roomVersion, auctionSeq, item };
}

export function LiveAuctionRoom({
  breakId: _breakId,
  roomTitle,
  roomCategory,
  discoveryVisibility = "public",
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
  teaserVideoUrl = null,
  clockSkewMs: clockSkewProp = 0,
  buyerLiveBidPaymentReady,
  buyerLiveShippingReady,
  giveaways = [],
  onOpenWallet,
  onApplyVariantPurchase,
  buyerPaymentRecoveryPending = false,
  broadcastCommerceBlocked = false,
  broadcastPurchaseBlocked = false,
  broadcastCommerceHint = null,
}: LiveAuctionRoomProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const sellerStoreHref =
    sellerShopUsername && sellerShopUsername.trim().length > 0 ? sellerProfilePath(sellerShopUsername.trim()) : null;

  /** Two-column rail only on wide desktop (1400px+). Tablets/iPads stay stacked: queue below video like phone. */
  const [buyerWideRail, setBuyerWideRail] = useState(false);
  const [buyerLineupOpen, setBuyerLineupOpen] = useState(false);
  const openBuyerShop = useCallback(() => setBuyerLineupOpen(true), []);
  const isBuyerDesktop = useBuyerLiveDesktop();
  const [tipOpen, setTipOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [roomPaymentMethodId, setRoomPaymentMethodId] = useState<string | null>(null);
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

  const autoCloseNudgedItemRef = useRef<string | null>(null);
  useEffect(() => {
    const active = dbItems.find((x) => x.status === "active");
    if (!active?.biddingOpen || !active.auctionEndsAt) return;
    const endsMs = Date.parse(active.auctionEndsAt);
    if (!Number.isFinite(endsMs)) return;
    if (syncedWallTimeMs(clockSkewMs) < endsMs + 1500) return;
    if (autoCloseNudgedItemRef.current === active.id) return;
    autoCloseNudgedItemRef.current = active.id;
    void finalizeOverdueLiveAuctions(liveRoomId).then(() => onRefetch?.());
  }, [clockSkewMs, dbItems, auctionResolutionTick, liveRoomId, onRefetch]);

  const mappedDb = useMemo(
    () => dbItems.map((i) => mapDbItem(i, isLive, clockSkewMs)),
    [dbItems, isLive, auctionResolutionTick, clockSkewMs],
  );
  const activeDbItem = useMemo(() => dbItems.find((x) => x.status === "active") ?? null, [dbItems]);
  const activeHasVariants = Boolean(
    activeDbItem && isVariantSalesFormat(activeDbItem.salesFormat) && (activeDbItem.variants?.length ?? 0) > 0,
  );
  const activeVariantSpots = activeHasVariants ? summarizeVariantSpots(activeDbItem?.variants) : null;
  const pytCommerceLive = Boolean(activeHasVariants && isLive && activeDbItem?.status === "active");
  const buyerPinnedVariant = useMemo(() => {
    if (!activeDbItem?.variants?.length) return null;
    if (isRandomVariantAssignment(activeDbItem.variantAssignmentMode)) return null;
    return hostPinnedBuyerVariant(activeDbItem.variants, activeDbItem.variantAssignmentMode);
  }, [activeDbItem]);
  const spotAuctionLive = Boolean(activeDbItem && isVariantSpotAuctionLive(activeDbItem));
  const shopVariantSpots = activeHasVariants && activeDbItem
    ? summarizeVariantSpots(shopAvailableVariants(activeDbItem))
    : null;
  const shoppableSpotCount =
    activeHasVariants && activeDbItem ? shopAvailableSpotCount(activeDbItem) : 0;
  const variantPickLabel = activeDbItem
    ? isVariantSpotAuctionLive(activeDbItem)
      ? pinnedVariantAuctionPrimaryLabel(
          activeDbItem.salesFormat,
          liveAuctionMinBidUsd(activeDbItem) ?? activeDbItem.currentBidUsd ?? activeDbItem.startingBidUsd ?? buyerPinnedVariant?.priceUsd ?? 1,
        )
      : isRandomVariantAssignment(activeDbItem.variantAssignmentMode)
        ? variantBuyerSelectLabel(activeDbItem.salesFormat, true)
        : shoppableSpotCount > 0
          ? variantClaimPrimaryLabel(activeDbItem.salesFormat)
          : "Sold out"
    : "Select spot";
  const variantShopLabel = activeDbItem ? variantClaimPrimaryLabel(activeDbItem.salesFormat) : "Claim spot";
  const [hostAuctionDurationSec, setHostAuctionDurationSec] = useState(5);
  const [hostClutchTimeEnabled, setHostClutchTimeEnabled] = useState(false);
  const [hostAuctionBusy, setHostAuctionBusy] = useState(false);
  const [pinVariantBusy, setPinVariantBusy] = useState(false);
  const [hostMarkSoldBusy, setHostMarkSoldBusy] = useState(false);
  const [queueItems, setQueueItems] = useState<SaleItem[]>(mappedDb);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [variantSheetItemId, setVariantSheetItemId] = useState<string | null>(null);
  const [variantSheetInitialVariantId, setVariantSheetInitialVariantId] = useState<string | null>(null);
  /** Blocks double-submit while bid POST is in flight. */
  const [bidFlight, setBidFlight] = useState(false);
  const [customBidOpen, setCustomBidOpen] = useState(false);
  const [customBidDraft, setCustomBidDraft] = useState("");
  const [customBidMode, setCustomBidMode] = useState<LiveCustomBidMode>(LIVE_CUSTOM_BID_DEFAULT_MODE);
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
  const buyerQueueRows = useMemo(
    () =>
      projectBuyerQueueLineup(dbItems, {
        roomIsLive: isLive,
        clockSkewMs,
        nowMs: syncedWallTimeMs(clockSkewMs),
      }),
    [dbItems, isLive, clockSkewMs, auctionResolutionTick],
  );
  const handleBuyerShopSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setBuyerLineupOpen(false);
      const row = buyerQueueRows.find((r) => r.id === id);
      if (row?.queueAction === "variant_shop") {
        setVariantSheetItemId(id);
        setVariantSheetInitialVariantId(null);
        setVariantSheetOpen(true);
      }
    },
    [buyerQueueRows],
  );
  const variantSheetItem = useMemo(() => {
    if (variantSheetItemId) {
      return dbItems.find((i) => i.id === variantSheetItemId) ?? null;
    }
    return activeDbItem;
  }, [variantSheetItemId, dbItems, activeDbItem]);
  const buyerNextUpItem = useMemo(() => {
    const active = buyerLineupItems.find((i) => i.status === "live" || i.id === selectedId);
    return buyerLineupItems.find((i) => i.id !== active?.id) ?? buyerLineupItems[0] ?? null;
  }, [buyerLineupItems, selectedId]);

  const selectedQueue = queueItems.find((t) => t.id === selectedId) ?? null;
  const hasQueuedItems = queueItems.some((i) => i.status !== "sold" && i.status !== "skipped");
  /** Prefer the timed “live” row; a stale `posted` row earlier in the list must not steal focus from the open lot. */
  const activeQueueItem =
    queueItems.find((i) => i.status === "live") ??
    queueItems.find((i) => i.status === "posted") ??
    (roomStatus === "live" ? buyerLineupItems[0] ?? null : null);
  const showFeaturedAuctionOverlay =
    roomStatus !== "ended" &&
    (Boolean(activeQueueItem) || Boolean(activeDbItem?.status === "active" && activeHasVariants)) &&
    (roomStatus === "scheduled" || roomStatus === "live");
  const overlayItem = selectedQueue ?? activeQueueItem;
  const nowWall = syncedWallTimeMs(clockSkewMs);
  const activeLotBidPhase = useMemo(
    () => (activeDbItem ? resolveLiveAuctionLotBidPhase(activeDbItem, nowWall) : "inactive"),
    [activeDbItem, nowWall, auctionResolutionTick],
  );
  const hybridSpotCommerce =
    spotAuctionLive && (shopVariantSpots?.available ?? 0) > 0 && activeLotBidPhase === "bidding_open";
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

  const viewerId = session?.user?.id ?? null;
  const isWinning =
    Boolean(viewerId) &&
    Boolean(activeDbItem?.lastHighBidderId) &&
    viewerId === activeDbItem!.lastHighBidderId &&
    overlayIsLive;

  const auctionLeaderLine =
    !activeHasVariants && activeDbItem && (overlayIsLive || overlayTimerEndedUnsettled)
      ? isWinning
        ? "You're winning"
        : formatAuctionLeaderLine({
            lastHighBidderUsername: activeDbItem.lastHighBidderUsername,
            lastHighBidderId: activeDbItem.lastHighBidderId,
            currentBidUsd: activeDbItem.currentBidUsd,
            startingBidUsd: activeDbItem.startingBidUsd,
          })
      : null;

  useEffect(() => {
    setUserHighBidUsd(null);
    setCustomBidOpen(false);
    setCustomBidMode(LIVE_CUSTOM_BID_DEFAULT_MODE);
  }, [activeDbItem?.id]);

  useEffect(() => {
    if (!customBidOpen) return;
    setCustomBidDraft("");
  }, [buyerNextBidUsd, customBidOpen, activeDbItem?.id]);

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
  const pytFromPriceUsd = buyerPinnedVariant?.priceUsd ?? activeVariantSpots?.fromPriceUsd ?? spotPriceUsd;
  /** Item chrome shows last agreed price; bid CTA uses next increment (see `minNextBidUsd`). */
  const displayPrimaryUsd = activeHasVariants ? pytFromPriceUsd : overlayIsLive ? buyerCurrentHighUsd : spotPriceUsd;
  const displaySpotAmount = displayPrimaryUsd.toFixed(2);
  const primaryActionLabel = activeHasVariants
    ? `${variantPickLabel} · ${fmt(pytFromPriceUsd)}`
    : overlayIsLive
      ? `Place bid ${fmt(buyerNextBidUsd)}`
      : `Claim spot ${fmt(spotPriceUsd)}`;
  const primaryButtonLabel = !overlayIsLive && busy && !activeHasVariants ? "Claiming…" : primaryActionLabel;
  const selectedQueueUnavailable = !selectedQueue || selectedQueue.status === "sold" || selectedQueue.status === "skipped";
  /** Bidding uses `activeDbItem`; selection can point at another row (sold/queued) and must not grey out the bid CTA. */
  const bidActionLocked = pytCommerceLive
    ? false
    : overlayIsLive
      ? false
      : overlayTimerEndedUnsettled ||
        selectedQueueUnavailable ||
        selectedQueue?.status === "queued" ||
        selectedQueue?.status === "posted";
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
  const queueStatusLabelRaw = selectedQueue?.status ?? activeQueueItem?.status ?? "queued";
  /** Active lot bidding comes from `activeDbItem`; selection can point at another row — don’t hide the timer or “live” copy. */
  const queueStatusLabel =
    activeLotBidPhase === "bidding_open"
      ? "live"
      : activeLotBidPhase === "timer_ended_unsettled"
        ? "ended_pending"
        : queueStatusLabelRaw;
  const queueStatusText = activeHasVariants
    ? pytCommerceLive
      ? `${activeVariantSpots?.available ?? 0} spot${activeVariantSpots?.available === 1 ? "" : "s"} open`
      : !isLive
        ? "Waiting for host to go live"
        : "Up next"
    : queueStatusLabel === "live"
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
  const buyerPytCheckoutHudActive = Boolean(
    activeHasVariants && pytCommerceLive && !spotAuctionLive && !isHost && status === "authenticated",
  );
  const { preview: variantCheckoutPreview, loading: variantCheckoutPreviewLoading } = useLiveVariantCheckoutPreview({
    enabled: buyerPytCheckoutHudActive && buyerLiveWalletReady && Boolean(activeDbItem?.id),
    liveRoomId,
    itemId: activeDbItem?.id,
    itemPriceUsd: pytFromPriceUsd,
  });
  const pytCheckoutHudMetaLine = variantCheckoutPreview
    ? formatLiveVariantCheckoutHudMeta(variantCheckoutPreview)
    : buyerPytCheckoutHudActive && buyerLiveWalletReady && variantCheckoutPreviewLoading
      ? "Calculating shipping & tax…"
      : buyerPytCheckoutHudActive && !buyerLiveWalletReady
        ? "Add wallet for total with shipping + tax"
        : null;
  // Shipping + tax line for the active auction / buy-now pinned lot (parity with mobile).
  const activeLotIsAuction = Boolean(
    activeDbItem &&
      (activeDbItem.salesFormat === "auction" ||
        activeDbItem.biddingOpen === true ||
        activeDbItem.currentBidUsd != null),
  );
  const nonVariantPreviewPriceUsd = activeDbItem
    ? activeLotIsAuction
      ? activeDbItem.currentBidUsd ?? activeDbItem.startingBidUsd ?? activeDbItem.priceUsd ?? 0
      : activeDbItem.priceUsd ?? activeDbItem.startingBidUsd ?? 0
    : 0;
  const { preview: nonVariantCheckoutPreview } = useLiveVariantCheckoutPreview({
    enabled: Boolean(
      !activeHasVariants &&
        !isHost &&
        status === "authenticated" &&
        shipReady &&
        activeDbItem?.id &&
        nonVariantPreviewPriceUsd > 0,
    ),
    liveRoomId,
    itemId: activeDbItem?.id,
    itemPriceUsd: nonVariantPreviewPriceUsd,
  });
  const pinnedShippingTaxLine = nonVariantCheckoutPreview
    ? formatPinnedShippingTaxLine({
        isAuction: activeLotIsAuction,
        shippingDisplay: nonVariantCheckoutPreview.shippingDisplay,
        taxApplies: nonVariantCheckoutPreview.taxApplies === true,
        taxUsd: nonVariantCheckoutPreview.taxUsd,
      })
    : null;
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
  const hostStartEnabled = canHostStartLiveAuction(activeDbItem, {
    broadcastOnAir: isLive,
    lotBidPhase: activeLotBidPhase,
    isVariantItem: activeHasVariants,
    hasPinnedVariant: Boolean(buyerPinnedVariant),
    activeSpotCommerceMode: activeDbItem?.activeSpotCommerceMode ?? null,
  });
  const hostTimerEndedUnsettled = isLive && activeLotBidPhase === "timer_ended_unsettled";
  const guestNeedsAuth = status === "unauthenticated" && !isHost && isLive;
  const sessionPending = status === "loading" && !isHost && isLive;
  const sessionBlocksBuyer = status === "unauthenticated" && !isHost && isLive;
  /** Legacy break spot claims — do not block PYT/PYD variant shop checkout on the active lot. */
  const buyerClaimsBlocked = Boolean(
    !pytCommerceLive &&
      breakSnapshot &&
      (breakSnapshot.breakPaused || breakSnapshot.lockPurchases || breakSnapshot.breakFull),
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

  const purchaseBlocked = broadcastPurchaseBlocked;

  const actionsDisabled =
    !isLive ||
    broadcastCommerceBlocked ||
    staffCommerceBlocked ||
    busy ||
    (overlayIsLive && bidFlight) ||
    sessionPending ||
    sessionBlocksBuyer ||
    buyerClaimsBlocked ||
    bidActionLocked ||
    !breakDisclaimerAccepted ||
    (!isHost && isLive && !buyerLiveWalletReady);
  const staffCommerceHint = broadcastCommerceHint
    ? broadcastCommerceHint
    : staffCommerceBlocked
    ? isHost
      ? LIVE_HOST_SELF_COMMERCE_ERROR
      : viewerModeration.isModerator
        ? LIVE_MODERATOR_COMMERCE_ERROR
        : null
    : null;

  /** PYT/PYD — claim sheet for pick/random; spot auction uses bid flow. */
  const variantShopDisabled =
    !isLive ||
    purchaseBlocked ||
    staffCommerceBlocked ||
    busy ||
    sessionBlocksBuyer ||
    buyerClaimsBlocked ||
    shoppableSpotCount <= 0;

  const variantSpotBidDisabled =
    !isLive ||
    broadcastCommerceBlocked ||
    staffCommerceBlocked ||
    busy ||
    bidFlight ||
    sessionBlocksBuyer ||
    (spotAuctionLive && activeLotBidPhase !== "bidding_open");

  const variantPickerDisabled = spotAuctionLive ? variantSpotBidDisabled : variantShopDisabled;

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
      toast(liveEventReminderSuccessMessage(
        { liveRoomId, roomTitle: streamTitle, hostSellerId: sellerId, hostName: hostDisplayName },
        Boolean(result.alreadySet),
      ));
      return;
    }
    toast(result.error ?? "Could not set reminder.");
  };

  const customBidReserveSupported = !activeDbItem?.listingId;

  const handleSubmitCustomBid = async () => {
    const entered = Number.parseFloat(customBidDraft);
    try {
      const payload = resolveLiveCustomBidPayload({
        mode: customBidReserveSupported && customBidMode === "reserve" ? "reserve" : "exact",
        enteredUsd: entered,
        minNextBidUsd: buyerNextBidUsd,
      });
      await handlePlaceBid({
        amountUsd: payload.amountUsd,
        maxProxyUsd: payload.maxProxyUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enter a valid bid amount.";
      setActionError(msg);
      toast(msg);
    }
  };

  const handlePlaceBid = async (opts?: { amountUsd?: number; maxProxyUsd?: number }) => {
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
      let amountUsd: number;
      let maxProxyUsd: number | undefined = opts?.maxProxyUsd;

      if (opts?.amountUsd != null) {
        amountUsd = opts.amountUsd;
      } else {
        amountUsd = buyerNextBidUsd;
      }

      if (maxProxyUsd == null && !activeDbItem?.listingId) {
        maxProxyUsd = amountUsd;
      }

      if (amountUsd + 0.001 < buyerNextBidUsd) {
        setActionError(`Minimum bid is ${fmt(buyerNextBidUsd)}.`);
        return;
      }
      if (maxProxyUsd != null && !customBidReserveSupported) {
        setActionError("Max proxy bids are not supported for marketplace listing lots in this release.");
        return;
      }
      setBidFlight(true);
      const idempotencyKey = createLiveBidIdempotencyKey();
      try {
        const res = await fetch(
          `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(activeDbItem.id)}/bid`,
          {
            method: "POST",
            headers: liveBidRequestHeaders(idempotencyKey),
            credentials: "include",
            body: JSON.stringify({
              amountUsd,
              ...(maxProxyUsd != null ? { maxProxyUsd } : {}),
            }),
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
          // A rejected bid (outbid, reserve/min-bid changed, lot state moved on) leaves the
          // buyer's local `buyerNextBidUsd`/lot state stale until the next realtime event or
          // poll — resync immediately so the next bid attempt uses current numbers.
          void onRefetch?.();
          return;
        }
        const ack = parseAuctionHttpAckPayload(data);
        if (process.env.NODE_ENV === "development") {
          console.debug("[live-auction-client] bid HTTP ACK (break overlay)", ack);
        }
        onAuctionHttpAck?.(ack);
        const uid = session?.user?.id;
        if (uid && ack.item?.lastHighBidderId === uid) {
          setUserHighBidUsd(ack.item.currentBidUsd ?? amountUsd);
        } else {
          setUserHighBidUsd(null);
        }
        toast("Bid placed.");
        setCustomBidOpen(false);
        // ACK + realtime already updated local state — no delayed full refresh on the hot path.
      } catch {
        toast("We couldn't place that bid. Try again in a moment.");
        // Network error / timeout: the request may or may not have gone through server-side —
        // resync so the UI reflects reality instead of trusting the pre-bid local state.
        void onRefetch?.();
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
        credentials: "include",
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

  const handleOpenVariantShop = useCallback(() => {
    if (!activeDbItem || !pytCommerceLive) return;
    setVariantSheetItemId(activeDbItem.id);
    setVariantSheetInitialVariantId(null);
    setVariantSheetOpen(true);
  }, [activeDbItem, pytCommerceLive]);

  const handleBuyerVariantCommerce = useCallback(async () => {
    if (!activeDbItem || !pytCommerceLive) return;
    if (isVariantSpotAuctionLive(activeDbItem)) {
      await handlePlaceBid();
      return;
    }
    setVariantSheetItemId(activeDbItem.id);
    setVariantSheetInitialVariantId(buyerPinnedVariant?.id ?? null);
    setVariantSheetOpen(true);
  }, [activeDbItem, buyerPinnedVariant?.id, handlePlaceBid, pytCommerceLive]);

  const handleHostPinLiveVariant = useCallback(
    async (variantId: string) => {
      if (!activeDbItem?.variants?.length) return;
      setPinVariantBusy(true);
      setActionError(null);
      try {
        const updates = buildExclusiveHostPinUpdates(activeDbItem.variants, variantId);
        const res = await patchLiveItemVariants(liveRoomId, activeDbItem.id, updates);
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
    [activeDbItem, liveRoomId, onRefetch, router, toast],
  );

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

  const desktopVideoOverlay = (
    <div className="live-desktop-action-hud p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p data-testid="live-active-item-title" className="line-clamp-1 text-sm font-bold text-zinc-50">
            {selectedQueue?.displayTitle ?? activeQueueItem?.displayTitle ?? "Current item"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <p className="font-black text-amber-100">
              {buyerPytCheckoutHudActive && variantCheckoutPreview
                ? `Total ${fmt(variantCheckoutPreview.chargeNowUsd)}`
                : `$${displaySpotAmount}`}
            </p>
            {activeHasVariants ? (
              <>
                <span className="text-zinc-400">•</span>
                <p className="font-medium text-zinc-200">
                  {activeVariantSpots?.available ?? 0} spot{(activeVariantSpots?.available ?? 0) === 1 ? "" : "s"} open
                </p>
              </>
            ) : (
              <>
                <span className="text-zinc-400">•</span>
                <p className="font-medium text-zinc-200">{selectedQueue?.bids ?? activeQueueItem?.bids ?? 0} bids</p>
              </>
            )}
            <span className="text-zinc-400">•</span>
            <p className="text-zinc-300">{hostDisplayName}</p>
          </div>
          {auctionLeaderLine ? (
            <p
              className={`mt-1.5 truncate text-sm font-bold tracking-tight ${
                isWinning ? "text-gold-bright" : "text-zinc-50"
              }`}
              data-testid="live-auction-leader-line"
            >
              {auctionLeaderLine}
            </p>
          ) : null}
          {pytCheckoutHudMetaLine ? (
            <p className="mt-1 line-clamp-2 text-[10px] font-medium text-zinc-400">{pytCheckoutHudMetaLine}</p>
          ) : null}
          <p
            className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
              activeHasVariants
                ? "text-emerald-300"
                : queueStatusLabel === "live"
                  ? "text-emerald-300"
                  : queueStatusLabel === "posted"
                    ? "text-violet-200"
                    : "text-amber-200"
            }`}
          >
            {queueStatusText}
          </p>
          {!activeHasVariants && auctionCountdownLabel ? (
            <p className="mt-2 text-[11px] font-black tabular-nums text-emerald-200">Time left {auctionCountdownLabel}</p>
          ) : null}
          {isHost && activeDbItem?.status === "active" && !activeHasVariants ? (
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
                    title="Sudden death: the auction timer resets on every bid until bidding closes."
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
          {activeHasVariants && activeDbItem ? (
            hybridSpotCommerce ? (
              <>
                <button
                  data-testid="live-variant-claim-button"
                  type="button"
                  disabled={variantShopDisabled}
                  onClick={() => handleOpenVariantShop()}
                  className="min-h-10 min-w-[140px] rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-4 text-[11px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_22px_-8px_rgba(212,175,55,0.55)] transition-[transform,opacity,filter] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
                >
                  {variantShopLabel}
                </button>
                <button
                  data-testid="live-bid-button"
                  type="button"
                  disabled={variantSpotBidDisabled}
                  onClick={() => void handlePlaceBid()}
                  className="min-h-10 min-w-[140px] rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,opacity,filter] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
                >
                  {variantPickLabel}
                </button>
              </>
            ) : (
              <button
                data-testid="live-bid-button"
                type="button"
                disabled={variantPickerDisabled}
                onClick={() => void handleBuyerVariantCommerce()}
                className="min-h-10 min-w-[170px] rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-gold to-gold-bright px-4 text-[11px] font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_22px_-8px_rgba(212,175,55,0.55)] transition-[transform,opacity,filter] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
              >
                {variantPickLabel}
              </button>
            )
          ) : (
            <button
              data-testid="live-bid-button"
              type="button"
              disabled={actionsDisabled}
              onClick={() => void handlePlaceBid()}
              className="min-h-10 min-w-[170px] rounded-[var(--live-radius-chrome)] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_22px_-8px_rgba(167,139,250,0.8)] transition-[transform,opacity,filter] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
            >
              {primaryButtonLabel}
            </button>
          )}
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
      {!activeHasVariants ? (
        <LiveShippingIndicator
          liveShowId={liveRoomId}
          previewLiveRoomItemId={activeDbItem?.id}
          pollMs={isLive ? 8000 : 0}
          className="mt-3"
        />
      ) : null}
      {!activeHasVariants && selectedQueue?.status === "posted" ? (
        <p className="mt-2 text-[10px] text-violet-200/90">
          {isLive
            ? isHost
              ? "Choose a timer and tap Start to open bidding."
              : "This lot is on display. The host will open bidding shortly."
            : "This lot is on display here. Bidding opens when the host goes live."}
        </p>
      ) : !activeHasVariants && !isLive ? (
        <p className="mt-2 text-[10px] text-amber-200/90">Auction has not started yet</p>
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
          to bid or claim spots.
        </p>
      ) : null}
      {actionError ? <p className="mt-2 text-[10px] font-medium text-rose-300">{actionError}</p> : null}
      {!actionError && staffCommerceHint ? (
        <p className="mt-2 text-[10px] font-medium text-amber-200/90">{staffCommerceHint}</p>
      ) : null}
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
          {!activeHasVariants ? (
            <>
              <p className="line-clamp-1 text-[10px] text-zinc-400/90">{overlayItem?.description ?? "Premium break spot with live reveal."}</p>
              <p className="mt-0.5 line-clamp-1 text-[9px] text-zinc-500">
                {pinnedShippingTaxLine ?? overlayItem?.shippingLine ?? "Shipping + taxes calculated at checkout"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-emerald-300/90">
                {activeVariantSpots?.available ?? 0} spot{(activeVariantSpots?.available ?? 0) === 1 ? "" : "s"} open
              </p>
              {pytCheckoutHudMetaLine ? (
                <p className="mt-0.5 line-clamp-2 text-[9px] font-medium text-zinc-400">{pytCheckoutHudMetaLine}</p>
              ) : null}
            </>
          )}
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <p className="text-[13px] font-black tabular-nums tracking-tight text-gold-bright motion-safe:[animation:live-price-glow_3.2s_ease-in-out_infinite] motion-reduce:[animation:none]">
            {overlayItem
              ? activeHasVariants
                ? variantCheckoutPreview
                  ? fmt(variantCheckoutPreview.chargeNowUsd)
                  : fmt(pytFromPriceUsd)
                : overlayIsLive
                  ? fmt(buyerCurrentHighUsd)
                  : fmt(overlayItem.buyNow ?? overlayItem.topBid)
              : "$0"}
          </p>
          {!activeHasVariants && auctionLeaderLine ? (
            <p
              className={`mt-1 max-w-[9.5rem] truncate text-right text-[12px] font-bold leading-tight ${
                isWinning ? "text-gold-bright" : "text-zinc-50"
              }`}
              data-testid="live-auction-leader-line"
            >
              {auctionLeaderLine}
            </p>
          ) : null}
          {!activeHasVariants ? (
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
          ) : null}
        </div>
      </div>
      {isHost && activeDbItem?.status === "active" && !activeHasVariants ? (
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
                title="Sudden death: the auction timer resets on every bid until bidding closes."
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
      {pytCommerceLive && activeDbItem ? (
        hybridSpotCommerce ? (
          <div className="mt-2 flex gap-2">
            <button
              data-testid="live-variant-claim-button"
              type="button"
              disabled={variantShopDisabled}
              onClick={() => handleOpenVariantShop()}
              className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-40 md:min-h-11 md:text-[11px]"
            >
              {variantShopLabel}
            </button>
            <button
              data-testid="live-bid-button"
              type="button"
              disabled={variantSpotBidDisabled}
              onClick={() => void handlePlaceBid()}
              className="min-h-10 flex-1 rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40 md:min-h-11 md:text-[11px]"
            >
              {variantPickLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={variantPickerDisabled}
            onClick={() => void handleBuyerVariantCommerce()}
            className="mt-2 min-h-10 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright text-[10px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-40 md:min-h-11 md:text-[11px]"
          >
            {variantPickLabel}
          </button>
        )
      ) : null}
      {overlayIsLive && !activeHasVariants ? (
        <div className="mt-2 flex min-h-10 flex-col gap-1.5">
          {customBidOpen ? (
            <div className="flex flex-col gap-1.5 rounded-2xl border border-[color:var(--live-border)] bg-black/40 p-2.5">
              <label className="flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--live-border)] bg-black/40 px-3">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400">$</span>
                <input
                  type="number"
                  min={buyerNextBidUsd}
                  step="1"
                  inputMode="decimal"
                  placeholder={String(buyerNextBidUsd)}
                  value={customBidDraft}
                  onChange={(e) => setCustomBidDraft(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold tabular-nums text-zinc-100 outline-none"
                  aria-label="Custom bid amount"
                />
              </label>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-zinc-100">{LIVE_CUSTOM_BID_MODE_COPY.exact.label}</p>
                  <p className="text-[10px] leading-snug text-zinc-400">
                    {customBidMode === "exact"
                      ? LIVE_CUSTOM_BID_MODE_COPY.exact.description
                      : "Off = Max bid (default). Bids the minimum now and auto-raises up to your amount."}
                  </p>
                  {!customBidReserveSupported ? (
                    <p className="mt-1 text-[10px] text-zinc-500">Max bid is not available for marketplace listing lots.</p>
                  ) : (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {customBidMode === "exact"
                        ? "Exact places your full amount immediately."
                        : "Recommended — you only pay one increment above the competition."}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Exact bid"
                  aria-checked={customBidMode === "exact"}
                  disabled={!customBidReserveSupported}
                  onClick={() => setCustomBidMode((m) => (m === "exact" ? "reserve" : "exact"))}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
                    customBidMode === "exact" ? "bg-gold/80" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      customBidMode === "exact" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                disabled={actionsDisabled || bidFlight}
                onClick={() => void handleSubmitCustomBid()}
                className="min-h-10 rounded-full bg-gold px-3 text-[11px] font-black uppercase tracking-wide text-zinc-950 disabled:opacity-50 md:min-h-11"
              >
                {bidFlight
                  ? "Placing…"
                  : customBidReserveSupported && customBidMode === "reserve"
                    ? "Set max bid"
                    : "Place exact bid"}
              </button>
            </div>
          ) : null}
          <div className="flex min-h-10 items-center gap-1.5 max-[380px]:gap-1 md:min-h-11">
            <button
              type="button"
              aria-pressed={customBidOpen}
              onClick={() => setCustomBidOpen((v) => !v)}
              className={`min-h-10 shrink-0 rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-wide transition-[transform,background-color] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.97] motion-reduce:active:scale-100 max-[380px]:px-2 max-[380px]:text-[9px] md:min-h-11 md:px-3 ${
                customBidOpen
                  ? "border-gold/50 bg-gold/15 text-gold-bright"
                  : "border-[color:var(--live-border)] bg-white/[0.06] text-zinc-200"
              }`}
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
        </div>
      ) : null}
      {pytCommerceLive ? null : overlayIsLive ? null : overlayTimerEndedUnsettled ? (
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

  /** Desktop video overlay — same mobile glass sheet + bid buttons; actions on the stage rail. */
  const buyerDesktopCommerceOverlay =
    isBuyerDesktop && activeHasVariants && !isHost ? (
      <BuyerLiveDesktopCommerce>{mobileVideoOverlay}</BuyerLiveDesktopCommerce>
    ) : (
      desktopVideoOverlay
    );

  const desktopItemBoardCommerce =
    showFeaturedAuctionOverlay
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
            {variantPickLabel}
          </button>
        </div>
      ) : (
        <BuyerVariantClaimCta
          label={variantPickLabel}
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
    (activeHasVariants && activeDbItem ? (
      <LiveVariantSpotBoard
        item={activeDbItem}
        hostMode={isHost}
        highlightUsername={!isHost ? session?.user?.username ?? null : null}
        onPinVariant={
          isHost &&
          activeDbItem.status === "active" &&
          !isRandomVariantAssignment(activeDbItem.variantAssignmentMode) &&
          !activeDbItem.variantBreakReadyAt &&
          !activeDbItem.variantBreakBeganAt
            ? handleHostPinLiveVariant
            : undefined
        }
        pinBusy={pinVariantBusy}
      />
    ) : null);

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
    onNotifyMe: () => void handleNotifyMe(),
    streamPlaybackRefreshNonce,
    viewerAuthenticated: status === "authenticated",
    scheduledStartAt,
    thumbnailUrl,
    teaserVideoUrl,
    buyerShellMode: isBuyerDesktop,
    showRightActions: !isHost,
    onShop: isHost ? undefined : openBuyerShop,
    onShare: handleShare,
    onWallet: handleWallet,
    onTip: isLive && !isHost && !buyerPaymentRecoveryPending ? handleTip : undefined,
    giveawaySideTab,
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
                  actionOverlay={desktopItemBoardOverlay}
                  mobileActionOverlay={null}
                  chatOverlay={null}
                />
              </>
            }
            hostBanner={isHost ? <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType="break" /> : undefined}
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
                  onSelect={handleBuyerShopSelect}
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
                  actionOverlay={desktopStageOverlay}
                  mobileActionOverlay={showFeaturedAuctionOverlay ? mobileVideoOverlay : desktopStageOverlay}
                  chatOverlay={floatingChatOverlay}
                />
              </div>

              {isHost ? (
                <HostLiveRoomConsoleBanner liveRoomId={liveRoomId} roomType="break" />
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
                        ? `${row.metaLine} · ${buyerQueueRows.length} in shop`
                        : `${buyerQueueRows.length} in shop`;
                    })()
                  }
                  queueCount={buyerQueueRows.length}
                  onOpenQueue={openBuyerShop}
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
        title="Shop"
        subtitle={`${buyerQueueRows.length} item${buyerQueueRows.length === 1 ? "" : "s"} in this room`}
        sellerStoreHref={sellerStoreHref}
      >
        <BuyerLiveQueueList
          items={buyerQueueRows.map((item) => ({
            id: item.id,
            displayTitle: item.displayTitle,
            metaLine: item.metaLine,
          }))}
          selectedId={selectedId}
          onSelect={handleBuyerShopSelect}
          emptyHint="Items the host adds to this show will appear here."
        />
      </BuyerLiveQueueSheet>
      {variantSheetItem && isVariantPurchaseItem(variantSheetItem) ? (
        <LiveVariantSelectionSheet
          open={variantSheetOpen}
          onClose={() => {
            setVariantSheetOpen(false);
            setVariantSheetItemId(null);
            setVariantSheetInitialVariantId(null);
          }}
          item={variantSheetItem}
          liveRoomId={liveRoomId}
          walletReady={buyerLiveWalletReady}
          initialVariantId={variantSheetInitialVariantId}
          excludeVariantIds={
            spotAuctionLive && variantSheetItem.auctionVariantId
              ? [variantSheetItem.auctionVariantId]
              : undefined
          }
          onWalletRequired={() => {
            setVariantSheetOpen(false);
            onOpenWallet();
          }}
          onPurchased={(payload) => {
            onApplyVariantPurchase?.(payload);
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
        showTitle={streamTitle}
        hostUsername={sellerShopUsername ?? hostDisplayName.replace(/^@+/, "")}
        isLive={isLive}
        category={roomCategory}
        canNotifyFollowers={isHost && discoveryVisibility !== "private"}
        onToast={toast}
      />
    </div>
  );
}
