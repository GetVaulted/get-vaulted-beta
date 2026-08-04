import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  breakSpotFindMany: vi.fn(),
  variantFindMany: vi.fn(),
  layawayFindMany: vi.fn(),
  getUserReferralSummary: vi.fn(),
  getAvailablePlatformCreditUsd: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: hoisted.orderFindMany },
    breakSpot: { findMany: hoisted.breakSpotFindMany },
    liveItemVariantPurchase: { findMany: hoisted.variantFindMany },
    layaway: { findMany: hoisted.layawayFindMany },
  },
}));

vi.mock("@/lib/referral-credit", () => ({
  getUserReferralSummary: hoisted.getUserReferralSummary,
}));

vi.mock("@/lib/giveaway/platform-credit", () => ({
  getAvailablePlatformCreditUsd: hoisted.getAvailablePlatformCreditUsd,
}));

import { buildBuyerFinancialsSummary } from "./buyer-financials";

describe("buildBuyerFinancialsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // First call = paid spend orders; later calls = pending orders
    hoisted.orderFindMany.mockResolvedValue([]);
    hoisted.breakSpotFindMany.mockResolvedValue([]);
    hoisted.variantFindMany.mockResolvedValue([]);
    hoisted.layawayFindMany.mockResolvedValue([]);
    hoisted.getUserReferralSummary.mockResolvedValue({
      availableUsd: 10,
      pendingUsd: 0,
      referralCode: "ABC",
      successfulReferrals: 1,
    });
    hoisted.getAvailablePlatformCreditUsd.mockResolvedValue(0);
  });

  it("sums marketplace vs live spent without double-counting orphan live rows", async () => {
    hoisted.orderFindMany
      .mockResolvedValueOnce([
        {
          id: "o1",
          totalUsd: 100,
          paymentStatus: "paid",
          createdAt: new Date("2026-07-18T15:00:00.000Z"),
          liveShippingSessionId: null,
          listing: { title: "Card A" },
          seller: { username: "seller_a" },
        },
        {
          id: "o2",
          totalUsd: 50,
          paymentStatus: "paid",
          createdAt: new Date("2026-07-18T16:00:00.000Z"),
          liveShippingSessionId: "sess_1",
          listing: { title: "Live item" },
          seller: { username: "host" },
        },
        {
          id: "o3",
          totalUsd: 20,
          paymentStatus: "pending",
          createdAt: new Date("2026-07-18T17:00:00.000Z"),
          liveShippingSessionId: null,
          listing: { title: "Unpaid" },
          seller: { username: "seller_a" },
        },
      ])
      .mockResolvedValueOnce([{ totalUsd: 20 }]); // pending orders query

    hoisted.breakSpotFindMany
      .mockResolvedValueOnce([
        {
          id: "bs1",
          priceUsd: 35,
          spotLabel: "LAA",
          paidAt: new Date("2026-07-18T14:00:00.000Z"),
          createdAt: new Date("2026-07-18T14:00:00.000Z"),
          liveRoom: { id: "room_1", title: "Break", seller: { username: "host" } },
        },
      ])
      .mockResolvedValueOnce([]); // unpaid break spots

    hoisted.variantFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    hoisted.layawayFindMany.mockResolvedValue([
      {
        id: "lay_1",
        remainingBalanceUsd: 80,
        amountPaidUsd: 40,
        listing: { title: "Layaway card" },
        updatedAt: new Date("2026-07-18T12:00:00.000Z"),
      },
    ]);

    const summary = await buildBuyerFinancialsSummary(
      "buyer_1",
      "UTC",
      new Date("2026-07-18T18:00:00.000Z"),
    );

    expect(summary.lifetimeSpentUsd).toBe(185); // 100 + 50 + 35
    expect(summary.marketplaceSpentUsd).toBe(100);
    expect(summary.liveSpentUsd).toBe(85);
    expect(summary.todaySpentUsd).toBe(185);
    expect(summary.monthSpentUsd).toBe(185);
    expect(summary.pendingPaymentUsd).toBe(20);
    expect(summary.layawayRemainingUsd).toBe(80);
    expect(summary.openBalanceUsd).toBe(100);
    expect(summary.referralCreditUsd).toBe(10);
    expect(summary.paidOrderCount).toBe(3);
  });
});
