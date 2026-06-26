import { describe, expect, it } from "vitest";
import { resolveUnpinnedActiveItemStatus } from "@/lib/resolve-unpinned-active-item-status";

describe("resolveUnpinnedActiveItemStatus", () => {
  it("queues a standard active lot with remaining quantity", () => {
    expect(
      resolveUnpinnedActiveItemStatus({
        salesFormat: "auction",
        quantity: 3,
        quantityInitial: 3,
        status: "active",
      }),
    ).toBe("queued");
  });

  it("marks a fully sold multi-quantity lot as sold", () => {
    expect(
      resolveUnpinnedActiveItemStatus({
        salesFormat: "auction",
        quantity: 0,
        quantityInitial: 2,
        status: "active",
      }),
    ).toBe("sold");
  });

  it("queues a break item when spots remain", () => {
    expect(
      resolveUnpinnedActiveItemStatus({
        salesFormat: "team_break",
        quantity: 1,
        quantityInitial: 1,
        status: "active",
        variants: [{ quantityRemaining: 1, status: "available" }],
      }),
    ).toBe("queued");
  });

  it("marks a break item sold when every spot is gone", () => {
    expect(
      resolveUnpinnedActiveItemStatus({
        salesFormat: "team_break",
        quantity: 1,
        quantityInitial: 1,
        status: "active",
        variants: [{ quantityRemaining: 0, status: "sold_out" }],
      }),
    ).toBe("sold");
  });
});
