import { describe, expect, it } from "vitest";
import { mergeLiveRoomDetailFromFetch } from "@/lib/live-room-fetch-merge";
import type { LiveRoomDetailDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";

function item(id: string, itemVersion: number, patch: Partial<LiveRoomItemDTO> = {}): LiveRoomItemDTO {
  const quantity = patch.quantity ?? 1;
  const quantityInitial = patch.quantityInitial ?? quantity;
  const soldQuantity = patch.soldQuantity ?? 0;
  const remainingQuantity = patch.remainingQuantity ?? quantity;

  return {
    id,
    liveRoomId: patch.liveRoomId ?? "room1",
    listingId: patch.listingId ?? null,
    title: patch.title ?? "Lot",
    quantity,
    quantityInitial,
    soldQuantity,
    remainingQuantity,
    currentUnitNumber: patch.currentUnitNumber ?? 1,
    displayTitle: patch.displayTitle ?? "Lot",
    progressLabel: patch.progressLabel ?? null,
    imageUrl: patch.imageUrl ?? "",
    priceUsd: patch.priceUsd ?? 1,
    startingBidUsd: patch.startingBidUsd ?? 1,
    bidIncrementUsd: patch.bidIncrementUsd ?? null,
    reservePriceUsd: patch.reservePriceUsd ?? null,
    currentBidUsd: patch.currentBidUsd ?? null,
    lastHighBidderId: patch.lastHighBidderId ?? null,
    lastHighBidderUsername: patch.lastHighBidderUsername ?? null,
    status: patch.status ?? "active",
    sortOrder: patch.sortOrder ?? 0,
    teamBoardMisc: patch.teamBoardMisc ?? false,
    itemVersion,
    biddingOpen: patch.biddingOpen ?? false,
    auctionEndsAt: patch.auctionEndsAt ?? null,
    clutchTimeEnabled: patch.clutchTimeEnabled ?? false,
    salesFormat: patch.salesFormat ?? "auction",
    variants: patch.variants ?? [],
    variantBreakReadyAt: patch.variantBreakReadyAt ?? null,
    variantBreakBeganAt: patch.variantBreakBeganAt ?? null,
    createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function room(partial: Partial<LiveRoomDetailDTO> & Pick<LiveRoomDetailDTO, "items">): LiveRoomDetailDTO {
  const items = partial.items;
  const base: LiveRoomDetailDTO = {
    id: "room1",
    sellerId: "seller1",
    sellerUsername: "host",
    title: "Show",
    description: "",
    category: "Other",
    roomType: "break",
    status: "live",
    thumbnailUrl: "",
    viewerCount: 0,
    roomVersion: 1,
    auctionEventSeq: 0,
    scheduledStartAt: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    items,
    messages: [],
    activeItem: items.find((i) => i.status === "active") ?? null,
    break: null,
    teamBoardLeague: "nfl",
    tipRecipientMode: "host",
    tipModeratorId: null,
    tipModeratorUsername: null,
    tipsToModerator: false,
  };

  const merged: LiveRoomDetailDTO = {
    ...base,
    ...partial,
    items,
    tipRecipientMode: partial.tipRecipientMode ?? base.tipRecipientMode,
    tipModeratorId: partial.tipModeratorId ?? base.tipModeratorId,
    tipModeratorUsername: partial.tipModeratorUsername ?? base.tipModeratorUsername,
    tipsToModerator: partial.tipsToModerator ?? base.tipsToModerator,
    activeItem: items.find((i) => i.status === "active") ?? null,
  };

  return merged;
}

describe("mergeLiveRoomDetailFromFetch", () => {
  it("does not regress room lifecycle when incoming snapshot has lower roomVersion (stale replica)", () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    const prev = room({
      status: "live",
      roomVersion: 10,
      endedAt: null,
      items: [item("i1", 5, { biddingOpen: true, auctionEndsAt: ends })],
    });
    const incoming = room({
      status: "ended",
      roomVersion: 3,
      endedAt: "2026-01-02T00:00:00.000Z",
      items: [item("i1", 3, { biddingOpen: false, auctionEndsAt: null })],
    });
    const merged = mergeLiveRoomDetailFromFetch(prev, incoming);
    expect(merged.status).toBe("live");
    expect(merged.endedAt).toBe(null);
    expect(merged.roomVersion).toBe(10);
    expect(merged.items[0]?.biddingOpen).toBe(true);
    expect(merged.items[0]?.auctionEndsAt).toBe(ends);
  });

  it("uses incoming lifecycle when roomVersion advances", () => {
    const prev = room({
      status: "live",
      roomVersion: 5,
      endedAt: null,
      items: [item("i1", 2, { biddingOpen: true })],
    });
    const incoming = room({
      status: "ended",
      roomVersion: 6,
      endedAt: "2026-01-03T00:00:00.000Z",
      items: [item("i1", 2, { biddingOpen: false })],
    });
    const merged = mergeLiveRoomDetailFromFetch(prev, incoming);
    expect(merged.status).toBe("ended");
    expect(merged.endedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(merged.roomVersion).toBe(6);
  });

  it("preserves buyerLiveBidPaymentReady from prev when incoming omits it (stale snapshot)", () => {
    const prev = room({
      roomVersion: 10,
      buyerLiveBidPaymentReady: false,
      items: [item("i1", 5)],
    });
    const incoming = room({
      roomVersion: 11,
      items: [item("i1", 6)],
    });
    delete (incoming as { buyerLiveBidPaymentReady?: boolean }).buyerLiveBidPaymentReady;
    const merged = mergeLiveRoomDetailFromFetch(prev, incoming);
    expect(merged.buyerLiveBidPaymentReady).toBe(false);
  });

  it("preserves buyerLiveShippingReady from prev when incoming omits it (stale snapshot)", () => {
    const prev = room({
      roomVersion: 10,
      buyerLiveShippingReady: false,
      items: [item("i1", 5)],
    });
    const incoming = room({
      roomVersion: 11,
      items: [item("i1", 6)],
    });
    delete (incoming as { buyerLiveShippingReady?: boolean }).buyerLiveShippingReady;
    const merged = mergeLiveRoomDetailFromFetch(prev, incoming);
    expect(merged.buyerLiveShippingReady).toBe(false);
  });
});
