import { describe, expect, it } from "vitest";
import {
  formatLiveQueueItemUnitTitle,
  resolveClosingUnitNumber,
  resolveHostConsoleUnitsClaimedOverride,
  resolveLiveBuyNowUnitSale,
  resolveLiveRoomItemQuantityState,
} from "@/lib/live-room-item-quantity-display";

describe("resolveHostConsoleUnitsClaimedOverride", () => {
  it("returns null when there are no BreakSpot rows so multi-qty auctions use remaining quantity", () => {
    expect(resolveHostConsoleUnitsClaimedOverride(0)).toBeNull();
    expect(resolveHostConsoleUnitsClaimedOverride(-1)).toBeNull();
    expect(resolveHostConsoleUnitsClaimedOverride(Number.NaN)).toBeNull();
  });

  it("passes through positive claim counts for classic break-spot lots", () => {
    expect(resolveHostConsoleUnitsClaimedOverride(1)).toBe(1);
    expect(resolveHostConsoleUnitsClaimedOverride(14)).toBe(14);
  });

  it("avoids the host stuck-on-#1 bug when quantity has already advanced", () => {
    // Host used to always pass unitsClaimed=0 → forces #1 even after sales.
    const stuck = resolveLiveRoomItemQuantityState({
      title: "PYT Break Mania 1",
      quantity: 8,
      quantityInitial: 10,
      status: "active",
      unitsClaimed: 0,
    });
    expect(stuck.displayTitle).toBe("PYT Break Mania 1 #1");

    const override = resolveHostConsoleUnitsClaimedOverride(0);
    const fixed = resolveLiveRoomItemQuantityState({
      title: "PYT Break Mania 1",
      quantity: 8,
      quantityInitial: 10,
      status: "active",
      unitsClaimed: override,
    });
    expect(fixed.displayTitle).toBe("PYT Break Mania 1 #3");
    expect(fixed.soldQuantity).toBe(2);
  });
});

describe("resolveLiveRoomItemQuantityState", () => {
  it("shows plain title when quantity is 1", () => {
    const state = resolveLiveRoomItemQuantityState({
      title: "Single Card",
      quantity: 1,
      quantityInitial: 1,
      status: "active",
    });
    expect(state.displayTitle).toBe("Single Card");
    expect(state.currentUnitNumber).toBeNull();
    expect(state.progressLabel).toBeNull();
  });

  it("shows numbered active unit for multi-quantity lots", () => {
    const first = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 10,
      quantityInitial: 10,
      status: "active",
    });
    expect(first.displayTitle).toBe("PYT Break 1 #1");
    expect(first.soldQuantity).toBe(0);
    expect(first.remainingQuantity).toBe(10);
    expect(first.progressLabel).toBe("0 / 10 sold");

    const second = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 8,
      quantityInitial: 10,
      status: "active",
    });
    expect(second.displayTitle).toBe("PYT Break 1 #3");
    expect(second.soldQuantity).toBe(2);
    expect(second.progressLabel).toBe("2 / 10 sold");
  });

  it("uses break spot claims for PYT progression", () => {
    const state = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 10,
      quantityInitial: 10,
      status: "active",
      unitsClaimed: 2,
    });
    expect(state.displayTitle).toBe("PYT Break 1 #3");
    expect(state.soldQuantity).toBe(2);
  });

  it("marks lot complete when fully sold", () => {
    const state = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 0,
      quantityInitial: 3,
      status: "sold",
    });
    expect(state.soldQuantity).toBe(3);
    expect(state.remainingQuantity).toBe(0);
    expect(state.progressLabel).toBe("3 / 3 sold");
  });

  // Regression: a lot's unit number must NOT advance when a round ends with no sale.
  // The server no-bid reset (resetLiveAuctionLotAfterNoBids / resetVariantSpotAuctionNoBids)
  // leaves `quantity`/`soldCount` untouched, so re-serializing the row keeps the same #N.
  // The number is only allowed to move once a unit actually sells (quantity decrements).
  it("keeps the same unit number across a no-bid round and only advances on a real sale", () => {
    // Host is running the 15th unit of a 15-unit lot (14 already sold).
    const running = resolveLiveRoomItemQuantityState({
      title: "Break 1",
      quantity: 1,
      quantityInitial: 15,
      status: "active",
    });
    expect(running.displayTitle).toBe("Break 1 #15");
    expect(running.currentUnitNumber).toBe(15);

    // No bids: the reset keeps quantity at 1 and status active → still #15, not #16.
    const afterNoBids = resolveLiveRoomItemQuantityState({
      title: "Break 1",
      quantity: 1,
      quantityInitial: 15,
      status: "active",
    });
    expect(afterNoBids.displayTitle).toBe("Break 1 #15");
    expect(afterNoBids.currentUnitNumber).toBe(15);

    // Only a real sale (quantity → 0, status sold) retires the number.
    const afterSale = resolveLiveRoomItemQuantityState({
      title: "Break 1",
      quantity: 0,
      quantityInitial: 15,
      status: "sold",
    });
    expect(afterSale.soldQuantity).toBe(15);
    expect(afterSale.currentUnitNumber).toBeNull();
  });

  // Regression for variant/PYT spot breaks: the unit number is driven by variant soldCount
  // (passed as `unitsClaimed`). A no-bid spot round leaves soldCount untouched, so #N holds.
  it("keeps the variant/PYT unit number across a no-bid spot round", () => {
    const running = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 20,
      quantityInitial: 20,
      status: "active",
      unitsClaimed: 14, // 14 spots already sold → currently on #15
    });
    expect(running.displayTitle).toBe("PYT Break 1 #15");

    // No bids on the spot auction → soldCount (unitsClaimed) unchanged → still #15.
    const afterNoBids = resolveLiveRoomItemQuantityState({
      title: "PYT Break 1",
      quantity: 20,
      quantityInitial: 20,
      status: "active",
      unitsClaimed: 14,
    });
    expect(afterNoBids.displayTitle).toBe("PYT Break 1 #15");
  });
});

describe("resolveLiveBuyNowUnitSale", () => {
  it("increments soldQuantity by one per purchase and solds out only when exhausted", () => {
    const row = {
      title: "Slab lot",
      quantity: 3,
      quantityInitial: 3,
      status: "active" as const,
    };

    const afterFirst = resolveLiveBuyNowUnitSale(row);
    expect(afterFirst.soldQuantity).toBe(1);
    expect(afterFirst.remainingQuantity).toBe(2);
    expect(afterFirst.quantity).toBe(2);
    expect(afterFirst.status).toBe("active");
    expect(afterFirst.itemSoldOut).toBe(false);

    const afterSecond = resolveLiveBuyNowUnitSale({
      ...row,
      quantity: afterFirst.quantity,
      status: afterFirst.status,
    });
    expect(afterSecond.soldQuantity).toBe(2);
    expect(afterSecond.remainingQuantity).toBe(1);
    expect(afterSecond.status).toBe("active");
    expect(afterSecond.itemSoldOut).toBe(false);

    const afterThird = resolveLiveBuyNowUnitSale({
      ...row,
      quantity: afterSecond.quantity,
      status: afterSecond.status,
    });
    expect(afterThird.soldQuantity).toBe(3);
    expect(afterThird.remainingQuantity).toBe(0);
    expect(afterThird.quantity).toBe(0);
    expect(afterThird.status).toBe("sold");
    expect(afterThird.itemSoldOut).toBe(true);
  });
});

describe("resolveClosingUnitNumber", () => {
  it("returns the unit index about to close", () => {
    expect(resolveClosingUnitNumber({ quantity: 10, quantityInitial: 10 })).toBe(1);
    expect(resolveClosingUnitNumber({ quantity: 7, quantityInitial: 10 })).toBe(4);
    expect(resolveClosingUnitNumber({ quantity: 1, quantityInitial: 3 })).toBe(3);
  });
});

describe("formatLiveQueueItemUnitTitle", () => {
  it("formats numbered titles", () => {
    expect(formatLiveQueueItemUnitTitle("PYT Break 1", 2)).toBe("PYT Break 1 #2");
  });
});
