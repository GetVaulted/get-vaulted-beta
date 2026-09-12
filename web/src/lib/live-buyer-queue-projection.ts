import { resolveLiveAuctionLotBidPhase } from "@/lib/live-auction-lot-phase";
import { isLiveAuctionPreBidEligible } from "@/lib/live-auction-pre-bid";
import { resolvePinnedLotOverlayPrice } from "@/lib/live-auction-overlay-price";
import { isVariantPurchaseItem, summarizeVariantSpots } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { syncedWallTimeMs } from "@/lib/server-clock-sync";

export type BuyerQueueLineupRow = {
  id: string;
  displayTitle: string;
  metaLine: string;
  imageUrl: string | null;
  salesFormat: LiveRoomItemDTO["salesFormat"];
  sortOrder: number;
  /** Matches host queue lane: auction (incl. PYT/PYD) vs buy-now SKU. */
  queueLane: "auction" | "bin";
  isPinned: boolean;
  isLiveBidding: boolean;
  listingId: string | null;
  queueAction: "pre_bid" | "buy_now" | "variant_shop" | "none";
};

/** Same inventory the host sees across auction + buy-now lanes (excludes sold/skipped). */
export function filterHostAlignedLineupItems(items: LiveRoomItemDTO[]): LiveRoomItemDTO[] {
  return items.filter((i) => i.status !== "sold" && i.status !== "skipped");
}

export function hostAuctionLaneItems(items: LiveRoomItemDTO[]): LiveRoomItemDTO[] {
  return filterHostAlignedLineupItems(items).filter((i) => i.salesFormat !== "buy_now");
}

export function hostBinLaneItems(items: LiveRoomItemDTO[]): LiveRoomItemDTO[] {
  return filterHostAlignedLineupItems(items).filter((i) => i.salesFormat === "buy_now");
}

function displayTitle(item: LiveRoomItemDTO): string {
  const base = item.displayTitle?.trim() || item.title?.trim() || "Untitled lot";
  return item.progressLabel?.trim() ? `${base} · ${item.progressLabel.trim()}` : base;
}

function queueLaneForItem(item: LiveRoomItemDTO): "auction" | "bin" {
  return item.salesFormat === "buy_now" ? "bin" : "auction";
}

function queueActionForItem(item: LiveRoomItemDTO): BuyerQueueLineupRow["queueAction"] {
  if (item.salesFormat === "buy_now") return "buy_now";
  if (isLiveAuctionPreBidEligible({
    id: item.id,
    status: item.status,
    salesFormat: item.salesFormat,
    listingId: item.listingId ?? null,
    biddingOpen: item.biddingOpen,
    startingBidUsd: item.startingBidUsd,
    currentBidUsd: item.currentBidUsd,
    lastHighBidderId: item.lastHighBidderId,
  })) {
    return "pre_bid";
  }
  return "none";
}

function rowBase(item: LiveRoomItemDTO, args: { roomIsLive: boolean; clockSkewMs?: number; nowMs?: number }) {
  const nowMs = args.nowMs ?? syncedWallTimeMs(args.clockSkewMs ?? 0);
  const title = displayTitle(item);
  const lane = queueLaneForItem(item);
  const isPinned = item.status === "active";
  const bidPhase = resolveLiveAuctionLotBidPhase(item, nowMs);
  const isLiveBidding = bidPhase === "bidding_open";
  const listingId = item.listingId?.trim() || null;
  const queueAction = queueActionForItem(item);
  return { title, lane, isPinned, isLiveBidding, listingId, queueAction };
}

/** Buyer-facing meta line aligned with host queue pricing semantics. */
export function buildBuyerQueueLineupRow(
  item: LiveRoomItemDTO,
  args: { roomIsLive: boolean; clockSkewMs?: number; nowMs?: number },
): BuyerQueueLineupRow {
  const { title, lane, isPinned, isLiveBidding, listingId, queueAction } = rowBase(item, args);

  if (item.salesFormat === "buy_now") {
    const price = resolvePinnedLotOverlayPrice({ commerceMode: "buy_now", priceUsd: item.priceUsd });
    return {
      id: item.id,
      displayTitle: title,
      metaLine: `Buy now · ${price.amountFormatted}`,
      imageUrl: item.imageUrl?.trim() || null,
      salesFormat: item.salesFormat,
      sortOrder: item.sortOrder,
      queueLane: lane,
      isPinned,
      isLiveBidding: false,
      listingId,
      queueAction,
    };
  }

  if (isVariantPurchaseItem(item)) {
    const spotStats = summarizeVariantSpots(item.variants);
    const price = resolvePinnedLotOverlayPrice({
      salesFormat: item.salesFormat,
      variants: item.variants,
      status: item.status,
    });
    const spotCopy =
      spotStats.available > 0
        ? `${spotStats.available} spot${spotStats.available === 1 ? "" : "s"} open`
        : "Sold out";
    const statusCopy = isPinned ? "On screen" : "Open now";
    return {
      id: item.id,
      displayTitle: title,
      metaLine: `${price.amountFormatted === "Sold out" ? "Sold out" : `From ${price.amountFormatted}`} · ${spotCopy} · ${statusCopy}`,
      imageUrl: item.imageUrl?.trim() || null,
      salesFormat: item.salesFormat,
      sortOrder: item.sortOrder,
      queueLane: lane,
      isPinned,
      isLiveBidding: false,
      listingId,
      // PYT/PYD spots are shoppable from any lineup position (parity with mobile).
      queueAction: spotStats.available > 0 ? "variant_shop" : "none",
    };
  }

  const price = resolvePinnedLotOverlayPrice({
    commerceMode: "auction",
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderId: item.lastHighBidderId,
    lastHighBidderUsername: item.lastHighBidderUsername,
  });

  let statusCopy = "Up next";
  if (isLiveBidding) statusCopy = "Live";
  else if (isPinned) statusCopy = "Pre-bid";

  const pricePrefix =
    price.kind === "current" ? "Current bid" : price.kind === "opening" ? "Opening bid" : price.label;

  return {
    id: item.id,
    displayTitle: title,
    metaLine: `${pricePrefix} ${price.amountFormatted} · ${statusCopy}`,
    imageUrl: item.imageUrl?.trim() || null,
    salesFormat: item.salesFormat,
    sortOrder: item.sortOrder,
    queueLane: lane,
    isPinned,
    isLiveBidding,
    listingId,
    queueAction,
  };
}

export function projectBuyerQueueLineup(
  items: LiveRoomItemDTO[],
  args: { roomIsLive: boolean; clockSkewMs?: number; nowMs?: number },
): BuyerQueueLineupRow[] {
  const sorted = [...filterHostAlignedLineupItems(items)].sort(
    (a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  return sorted.map((item) => buildBuyerQueueLineupRow(item, args));
}

/** Auction lots can be selected for pre-bid; buy-now / PYT rows open shop actions. */
export function buyerQueueRowSelectable(row: BuyerQueueLineupRow): boolean {
  return row.queueAction === "pre_bid" || row.queueAction === "buy_now" || row.queueAction === "variant_shop";
}
