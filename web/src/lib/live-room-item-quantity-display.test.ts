import { describe, expect, it } from "vitest";
import {
  formatLiveQueueItemUnitTitle,
  resolveClosingUnitNumber,
  resolveLiveBuyNowUnitSale,
  resolveLiveRoomItemQuantityState,
} from "@/lib/live-room-item-quantity-display";

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
