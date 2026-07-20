import { describe, expect, it } from "vitest";
import {
  buildBuyerQueueLineupRow,
  buyerQueueRowSelectable,
  filterHostAlignedLineupItems,
  hostAuctionLaneItems,
  hostBinLaneItems,
  projectBuyerQueueLineup,
} from "@/lib/live-buyer-queue-projection";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

function baseItem(overrides: Partial<LiveRoomItemDTO> = {}): LiveRoomItemDTO {
  return {
    id: "item-1",
    liveRoomId: "room-1",
    listingId: null,
    title: "Test lot",
    quantity: 1,
    quantityInitial: 1,
    soldQuantity: 0,
    remainingQuantity: 1,
    currentUnitNumber: null,
    displayTitle: "Test lot",
    progressLabel: null,
    imageUrl: "",
    priceUsd: null,
    startingBidUsd: 25,
    bidIncrementUsd: 1,
    reservePriceUsd: null,
    currentBidUsd: null,
    lastHighBidderId: null,
    lastHighBidderUsername: null,
    status: "queued",
    sortOrder: 0,
    teamBoardMisc: false,
    itemVersion: 1,
    biddingOpen: false,
    auctionEndsAt: null,
    clutchTimeEnabled: false,
    salesFormat: "auction",
    variantAssignmentMode: "pick",
    variants: [],
    variantBreakReadyAt: null,
    variantBreakBeganAt: null,
    variantSpotCommerceDefault: "fixed",
    activeSpotCommerceMode: null,
    auctionVariantId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("live-buyer-queue-projection", () => {
  it("filters sold/skipped like host queue lanes combined", () => {
    const items = [
      baseItem({ id: "a", status: "queued" }),
      baseItem({ id: "b", status: "sold" }),
      baseItem({ id: "c", status: "skipped" }),
      baseItem({ id: "d", status: "active", salesFormat: "buy_now", priceUsd: 40 }),
    ];
    expect(filterHostAlignedLineupItems(items).map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("splits auction vs bin lanes like host tabs", () => {
    const items = [
      baseItem({ id: "auction", salesFormat: "auction" }),
      baseItem({ id: "pyt", salesFormat: "variant_selection" }),
      baseItem({ id: "bin", salesFormat: "buy_now", priceUsd: 35 }),
    ];
    expect(hostAuctionLaneItems(items).map((i) => i.id)).toEqual(["auction", "pyt"]);
    expect(hostBinLaneItems(items).map((i) => i.id)).toEqual(["bin"]);
  });

  it("labels pre-bid pinned auction lots", () => {
    const row = buildBuyerQueueLineupRow(
      baseItem({ status: "active", biddingOpen: false, startingBidUsd: 35 }),
      { roomIsLive: true, nowMs: Date.now() },
    );
    expect(row.metaLine).toContain("Opening bid $35");
    expect(row.metaLine).toContain("Pre-bid");
    expect(row.isPinned).toBe(true);
  });

  it("labels buy-now queue rows", () => {
    const row = buildBuyerQueueLineupRow(
      baseItem({ salesFormat: "buy_now", priceUsd: 50, status: "queued" }),
      { roomIsLive: true, nowMs: Date.now() },
    );
    expect(row.metaLine).toBe("Buy now · $50");
    expect(row.queueLane).toBe("bin");
  });

  it("labels variant spot rows with from-price", () => {
    const row = buildBuyerQueueLineupRow(
      baseItem({
        salesFormat: "variant_selection",
        status: "active",
        variants: [
          {
            id: "v1",
            liveRoomItemId: "item-1",
            label: "Team A",
            priceUsd: 35,
            quantityInitial: 1,
            quantityRemaining: 1,
            soldCount: 0,
            isHot: false,
            imageUrl: "",
            color: "",
            sortOrder: 0,
            status: "available",
            buyerUsername: null,
          },
        ],
      }),
      { roomIsLive: true, nowMs: Date.now() },
    );
    expect(row.metaLine).toContain("From $35");
    expect(row.metaLine).toContain("1 spot open");
  });

  it("projects lineup in sort order", () => {
    const rows = projectBuyerQueueLineup(
      [
        baseItem({ id: "second", sortOrder: 2 }),
        baseItem({ id: "first", sortOrder: 1 }),
      ],
      { roomIsLive: true, nowMs: Date.now() },
    );
    expect(rows.map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("allows pre-bid, buy-now, and PYT shop actions", () => {
    const auction = buildBuyerQueueLineupRow(baseItem({ salesFormat: "auction", status: "active" }), {
      roomIsLive: true,
      nowMs: Date.now(),
    });
    const bin = buildBuyerQueueLineupRow(baseItem({ salesFormat: "buy_now", status: "active", priceUsd: 25 }), {
      roomIsLive: true,
      nowMs: Date.now(),
    });
    const pyt = buildBuyerQueueLineupRow(
      baseItem({
        salesFormat: "variant_selection",
        variants: [{
          id: "v1",
          liveRoomItemId: "item-1",
          label: "ARI",
          priceUsd: 40,
          quantityInitial: 1,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: "available",
          sortOrder: 0,
          buyerUsername: null,
          imageUrl: "",
          color: "",
        }],
      }),
      { roomIsLive: true, nowMs: Date.now() },
    );
    expect(buyerQueueRowSelectable(auction)).toBe(true);
    expect(auction.queueAction).toBe("pre_bid");
    expect(buyerQueueRowSelectable(bin)).toBe(true);
    expect(bin.queueAction).toBe("buy_now");
    expect(buyerQueueRowSelectable(pyt)).toBe(true);
    expect(pyt.queueAction).toBe("variant_shop");
    expect(pyt.metaLine).toContain("Open now");
  });
});
