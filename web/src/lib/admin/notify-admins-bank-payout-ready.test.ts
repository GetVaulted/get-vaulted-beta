import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  liveItemVariantPurchase: { findFirst: vi.fn(), findMany: vi.fn() },
  breakSpot: { findFirst: vi.fn(), findMany: vi.fn() },
  order: { findMany: vi.fn() },
  liveRoomItem: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const scheduleNotifyAdmins = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins }));

import { notifyAdminsIfBreakPayoutReady } from "@/lib/admin/notify-admins-bank-payout-ready";

const paidOrder = (id: string, payoutStatus: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "paid",
  paymentStatus: "paid",
  payoutStatus,
  ...extra,
});

describe("notifyAdminsIfBreakPayoutReady", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveItemVariantPurchase.findFirst.mockResolvedValue({ liveRoomItemId: "item1" });
    prismaMock.breakSpot.findFirst.mockResolvedValue(null);
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([
      { fulfillmentOrderId: "o1", settlementChannel: null },
      { fulfillmentOrderId: "o2", settlementChannel: null },
    ]);
    prismaMock.breakSpot.findMany.mockResolvedValue([]);
    prismaMock.order.findMany.mockResolvedValue([
      paidOrder("o1", "fast_payout_ready"),
      paidOrder("o2", "fast_payout_ready"),
    ]);
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ title: "2025 Prizm Hobby Box" });
    prismaMock.user.findUnique.mockResolvedValue({ username: "breaker" });
  });

  it("sends nothing for an order that is not part of a break", async () => {
    prismaMock.liveItemVariantPurchase.findFirst.mockResolvedValue(null);
    prismaMock.breakSpot.findFirst.mockResolvedValue(null);

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o1", sellerId: "s1" }),
    ).resolves.toBe("no_break");
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });

  it("waits while any order in the break is not ready yet", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      paidOrder("o1", "fast_payout_ready"),
      paidOrder("o2", "pending"),
    ]);

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o1", sellerId: "s1" }),
    ).resolves.toBe("waiting");
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });

  it("waits while a paid on-platform spot has no order yet", async () => {
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([
      { fulfillmentOrderId: "o1", settlementChannel: null },
      { fulfillmentOrderId: null, settlementChannel: null },
    ]);

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o1", sellerId: "s1" }),
    ).resolves.toBe("waiting");
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });

  it("sends one alert per break once every active order is ready", async () => {
    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o2", sellerId: "s1" }),
    ).resolves.toBe("notified");

    expect(scheduleNotifyAdmins).toHaveBeenCalledTimes(1);
    expect(scheduleNotifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_break_payout_ready",
        title: "Break payout ready · @breaker",
        dedupeKey: "admin_break_payout_ready:item1",
        body: expect.stringContaining("all 2 orders"),
      }),
    );
  });

  it("ignores cancelled and refunded orders and counts already paid-out ones as ready", async () => {
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([
      { fulfillmentOrderId: "o1", settlementChannel: null },
      { fulfillmentOrderId: "o2", settlementChannel: null },
      { fulfillmentOrderId: "o3", settlementChannel: null },
    ]);
    prismaMock.order.findMany.mockResolvedValue([
      paidOrder("o1", "paid_out"),
      paidOrder("o2", "pending", { status: "cancelled" }),
      paidOrder("o3", "fast_payout_ready"),
    ]);

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o3", sellerId: "s1" }),
    ).resolves.toBe("notified");
    expect(scheduleNotifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("all 2 orders") }),
    );
  });

  it("recognises legacy break-spot orders", async () => {
    prismaMock.liveItemVariantPurchase.findFirst.mockResolvedValue(null);
    prismaMock.breakSpot.findFirst.mockResolvedValue({ liveRoomItemId: "item9", liveRoomId: "room1" });
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([]);
    prismaMock.breakSpot.findMany.mockResolvedValue([{ fulfillmentOrderId: "o1" }]);
    prismaMock.order.findMany.mockResolvedValue([paidOrder("o1", "fast_payout_ready")]);

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o1", sellerId: "s1" }),
    ).resolves.toBe("notified");
    expect(scheduleNotifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "admin_break_payout_ready:item9" }),
    );
  });

  it("never throws if the lookup fails", async () => {
    prismaMock.liveItemVariantPurchase.findFirst.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyAdminsIfBreakPayoutReady({ orderId: "o1", sellerId: "s1" }),
    ).resolves.toBe("error");
  });
});
