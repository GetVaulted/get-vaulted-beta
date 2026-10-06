import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { GiveawayEntryType, UserRole } from "@/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  giveawayCampaign: { findMany: vi.fn(), findUnique: vi.fn() },
  giveawayEntryLedger: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
  },
  giveawayDraw: { findFirst: vi.fn() },
  giveawayFraudFlag: { count: vi.fn(), create: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/giveaway/fraud", () => ({
  evaluateAndFlagGiveawayUser: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/giveaway/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/giveaway/entries")>();
  return {
    ...actual,
    getActiveGiveawayCampaigns: vi.fn(),
  };
});

import { getActiveGiveawayCampaigns } from "@/lib/giveaway/entries";
import {
  clawbackPurchaseEntriesForOrder,
  eligiblePurchaseAmountFromOrder,
  onOrderPaidForGiveaways,
  purchaseEntriesFromAmountUsd,
  purchaseEntryIdempotencyKey,
} from "@/lib/giveaway/purchase-entries";

const getActiveMock = vi.mocked(getActiveGiveawayCampaigns);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.giveawayFraudFlag.create.mockResolvedValue({});
  prismaMock.giveawayDraw.findFirst.mockResolvedValue(null);
});

describe("purchaseEntriesFromAmountUsd", () => {
  it.each([
    [9.99, 0],
    [10, 1],
    [20, 2],
    [35, 3],
    [50, 5],
    [75, 7],
    [100, 10],
    [250, 25],
  ])("floor(%s / 10) = %s", (amount, expected) => {
    expect(purchaseEntriesFromAmountUsd(amount)).toBe(expected);
  });
});

describe("eligiblePurchaseAmountFromOrder", () => {
  it("restores store-credit discounts into the sale basis", () => {
    expect(
      eligiblePurchaseAmountFromOrder({
        itemPriceUsd: 40,
        referralCreditAppliedUsd: 10,
        platformCreditAppliedUsd: 0,
      }),
    ).toBe(50);
  });
});

describe("onOrderPaidForGiveaways", () => {
  it("awards idempotent purchase entries for paid eligible buyers", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      paymentStatus: "paid",
      itemPriceUsd: 35,
      referralCreditAppliedUsd: 0,
      platformCreditAppliedUsd: 0,
      buyer: {
        id: "buyer_1",
        email: "buyer@shop.com",
        emailVerified: new Date(),
        role: UserRole.user,
        suspendedAt: null,
        accountDeletedAt: null,
        createdAt: new Date(),
        referredById: null,
      },
    });
    getActiveMock.mockResolvedValue([
      {
        id: "camp_1",
        startsAt: new Date("2026-01-01"),
        endsAt: new Date("2026-12-31"),
      } as never,
    ]);
    prismaMock.giveawayEntryLedger.create.mockResolvedValue({ id: "e1" });

    await onOrderPaidForGiveaways("ord_1");

    expect(prismaMock.giveawayEntryLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: "camp_1",
          userId: "buyer_1",
          entryType: GiveawayEntryType.purchase,
          quantity: 3,
          idempotencyKey: purchaseEntryIdempotencyKey("camp_1", "ord_1"),
        }),
      }),
    );
  });

  it("is a no-op on duplicate idempotency keys", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      paymentStatus: "paid",
      itemPriceUsd: 20,
      referralCreditAppliedUsd: 0,
      platformCreditAppliedUsd: 0,
      buyer: {
        id: "buyer_1",
        email: "buyer@shop.com",
        emailVerified: new Date(),
        role: UserRole.user,
        suspendedAt: null,
        accountDeletedAt: null,
        createdAt: new Date(),
        referredById: null,
      },
    });
    getActiveMock.mockResolvedValue([{ id: "camp_1" } as never]);
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    prismaMock.giveawayEntryLedger.create.mockRejectedValue(err);

    await expect(onOrderPaidForGiveaways("ord_1")).resolves.toBeUndefined();
  });

  it("skips unpaid and test buyers", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      paymentStatus: "pending_payment",
      itemPriceUsd: 100,
      referralCreditAppliedUsd: 0,
      platformCreditAppliedUsd: 0,
      buyer: {
        id: "buyer_1",
        email: "test+x@example.com",
        emailVerified: new Date(),
        role: UserRole.user,
        suspendedAt: null,
        accountDeletedAt: null,
        createdAt: new Date(),
        referredById: null,
      },
    });
    await onOrderPaidForGiveaways("ord_1");
    expect(prismaMock.giveawayEntryLedger.create).not.toHaveBeenCalled();
  });
});

describe("clawbackPurchaseEntriesForOrder", () => {
  it("writes a negative purchase row while preserving the grant", async () => {
    prismaMock.giveawayEntryLedger.findMany.mockResolvedValue([
      {
        id: "grant_1",
        campaignId: "camp_1",
        userId: "buyer_1",
        quantity: 5,
        idempotencyKey: purchaseEntryIdempotencyKey("camp_1", "ord_1"),
      },
    ]);
    prismaMock.giveawayCampaign.findUnique.mockResolvedValue({ winnerConfirmedAt: null });
    prismaMock.giveawayDraw.findFirst.mockResolvedValue(null);
    prismaMock.giveawayEntryLedger.create.mockResolvedValue({ id: "claw_1" });

    await clawbackPurchaseEntriesForOrder("ord_1");

    expect(prismaMock.giveawayEntryLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: -5,
          entryType: GiveawayEntryType.purchase,
          idempotencyKey: `purchase:camp_1:ord_1:clawback`,
        }),
      }),
    );
  });

  it("skips clawback after winner confirmation", async () => {
    prismaMock.giveawayEntryLedger.findMany.mockResolvedValue([
      {
        id: "grant_1",
        campaignId: "camp_1",
        userId: "buyer_1",
        quantity: 5,
        idempotencyKey: purchaseEntryIdempotencyKey("camp_1", "ord_1"),
      },
    ]);
    prismaMock.giveawayCampaign.findUnique.mockResolvedValue({
      winnerConfirmedAt: new Date(),
    });

    await clawbackPurchaseEntriesForOrder("ord_1");
    expect(prismaMock.giveawayEntryLedger.create).not.toHaveBeenCalled();
  });
});
