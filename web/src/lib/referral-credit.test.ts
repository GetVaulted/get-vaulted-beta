import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  referralCredit: {
    create: vi.fn().mockResolvedValue(undefined),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { amountUsd: 0 } }),
    count: vi.fn().mockResolvedValue(0),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const resolveReferrerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/referral-code", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/referral-code")>();
  return {
    ...actual,
    resolveReferrerIdFromReferralInput: resolveReferrerMock,
    ensureUserReferralCode: vi.fn().mockResolvedValue("K7H3N9Q2MW"),
  };
});

import {
  REFERRAL_CREDIT_AMOUNT_USD,
  REFERRAL_MIN_QUALIFYING_ORDER_USD,
  attributeReferralOnSignup,
  commitReferralCreditReservation,
  getAvailableReferralCreditUsd,
  grantReferralCreditsForQualifyingOrder,
  promoteDueReferralCredits,
  releaseReferralCreditReservation,
  reserveReferralCreditForCheckout,
} from "@/lib/referral-credit";

beforeEach(() => {
  vi.clearAllMocks();
  resolveReferrerMock.mockReset();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
  prismaMock.referralCredit.create.mockResolvedValue(undefined);
  prismaMock.referralCredit.findFirst.mockResolvedValue(null);
  prismaMock.referralCredit.findMany.mockResolvedValue([]);
  prismaMock.referralCredit.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.referralCredit.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 } });
  prismaMock.referralCredit.count.mockResolvedValue(0);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("attributeReferralOnSignup", () => {
  it("attributes a new account to the referrer resolved from the referral input", async () => {
    resolveReferrerMock.mockResolvedValue("referrer_1");
    await attributeReferralOnSignup("new_user_1", "K7H3N9Q2MW");
    expect(resolveReferrerMock).toHaveBeenCalledWith("K7H3N9Q2MW");
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "new_user_1", referredById: null },
      data: { referredById: "referrer_1", referredAt: expect.any(Date) },
    });
  });

  it("does nothing when no code is provided", async () => {
    resolveReferrerMock.mockResolvedValue(null);
    await attributeReferralOnSignup("new_user_1", null);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the code does not match any user", async () => {
    resolveReferrerMock.mockResolvedValue(null);
    await attributeReferralOnSignup("new_user_1", "nobody");
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to let a user refer themselves", async () => {
    resolveReferrerMock.mockResolvedValue("new_user_1");
    await attributeReferralOnSignup("new_user_1", "K7H3N9Q2MW");
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("never throws — a referral attribution bug must not block signup", async () => {
    resolveReferrerMock.mockRejectedValue(new Error("db down"));
    await expect(attributeReferralOnSignup("new_user_1", "K7H3N9Q2MW")).resolves.toBeUndefined();
  });
});

describe("grantReferralCreditsForQualifyingOrder", () => {
  const baseOrder = {
    id: "order_1",
    buyerId: "buyer_1",
    totalUsd: 30,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    paymentMethod: "stripe",
    shipAddress: "123 Main St",
    shipZip: "90210",
    buyer: { id: "buyer_1", email: "buyer@example.com", referredById: "referrer_1" },
  };

  it("grants a flat credit pair to both referrer and referee on a qualifying order", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);
    prismaMock.user.findUnique.mockResolvedValue({ email: "referrer@example.com" });

    await grantReferralCreditsForQualifyingOrder("order_1");

    expect(prismaMock.referralCredit.create).toHaveBeenCalledTimes(2);
    const [referrerCall, refereeCall] = prismaMock.referralCredit.create.mock.calls.map((c) => c[0].data);
    expect(referrerCall).toMatchObject({
      userId: "referrer_1",
      role: "referrer",
      amountUsd: REFERRAL_CREDIT_AMOUNT_USD,
      sourceOrderId: "order_1",
      status: "pending",
    });
    expect(refereeCall).toMatchObject({
      userId: "buyer_1",
      role: "referee",
      amountUsd: REFERRAL_CREDIT_AMOUNT_USD,
      sourceOrderId: "order_1",
      status: "pending",
    });
  });

  it("skips orders under the minimum qualifying amount", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...baseOrder,
      totalUsd: REFERRAL_MIN_QUALIFYING_ORDER_USD - 0.01,
    });
    await grantReferralCreditsForQualifyingOrder("order_1");
    expect(prismaMock.referralCredit.create).not.toHaveBeenCalled();
  });

  it("skips buyers who were never referred", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...baseOrder,
      buyer: { ...baseOrder.buyer, referredById: null },
    });
    await grantReferralCreditsForQualifyingOrder("order_1");
    expect(prismaMock.referralCredit.create).not.toHaveBeenCalled();
  });

  it("skips escrow orders — outside this program's scope", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...baseOrder, paymentMethod: "escrow" });
    await grantReferralCreditsForQualifyingOrder("order_1");
    expect(prismaMock.referralCredit.create).not.toHaveBeenCalled();
  });

  it("only grants once per referee — skips if the buyer already has a referee credit", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);
    prismaMock.referralCredit.findFirst.mockResolvedValue({ id: "existing_credit" });
    await grantReferralCreditsForQualifyingOrder("order_1");
    expect(prismaMock.referralCredit.create).not.toHaveBeenCalled();
  });

  it("voids both credits immediately when a Gmail dot/plus alias matches the referrer's own email", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...baseOrder,
      buyer: { ...baseOrder.buyer, email: "j.doe+alt@gmail.com" },
    });
    prismaMock.user.findUnique.mockResolvedValue({ email: "jdoe@gmail.com" });

    await grantReferralCreditsForQualifyingOrder("order_1");

    expect(prismaMock.referralCredit.create).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.referralCredit.create.mock.calls) {
      expect(call[0].data).toMatchObject({ status: "voided", voidReason: "self_referral_suspected" });
    }
  });

  it("voids both credits when the referee ships to an address the referrer has shipped to before", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);
    prismaMock.user.findUnique.mockResolvedValue({ email: "referrer@example.com" });
    prismaMock.order.findMany.mockResolvedValue([{ shipAddress: "123 Main St.", shipZip: "90210" }]);

    await grantReferralCreditsForQualifyingOrder("order_1");

    for (const call of prismaMock.referralCredit.create.mock.calls) {
      expect(call[0].data).toMatchObject({ status: "voided", voidReason: "self_referral_suspected" });
    }
  });

  it("swallows a unique-constraint violation as a safe replay, not an error", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);
    prismaMock.user.findUnique.mockResolvedValue({ email: "referrer@example.com" });
    const { Prisma } = await import("@/generated/prisma/client");
    prismaMock.referralCredit.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    await expect(grantReferralCreditsForQualifyingOrder("order_1")).resolves.toBeUndefined();
  });

  it("never throws on unexpected errors — must not block order finalize", async () => {
    prismaMock.order.findUnique.mockRejectedValue(new Error("db down"));
    await expect(grantReferralCreditsForQualifyingOrder("order_1")).resolves.toBeUndefined();
  });
});

describe("promoteDueReferralCredits", () => {
  it("promotes a pending credit to available once its hold window has passed and the order is clean", async () => {
    prismaMock.referralCredit.findMany.mockResolvedValue([{ id: "credit_1", sourceOrderId: "order_1" }]);
    prismaMock.order.findMany.mockResolvedValue([
      { id: "order_1", paymentStatus: "paid", refundRequests: [] },
    ]);

    await promoteDueReferralCredits("user_1");

    expect(prismaMock.referralCredit.updateMany).toHaveBeenCalledWith({
      where: { id: "credit_1", status: "pending" },
      data: { status: "available" },
    });
  });

  it("voids a pending credit whose source order was refunded", async () => {
    prismaMock.referralCredit.findMany.mockResolvedValue([{ id: "credit_1", sourceOrderId: "order_1" }]);
    prismaMock.order.findMany.mockResolvedValue([
      { id: "order_1", paymentStatus: "refunded", refundRequests: [] },
    ]);

    await promoteDueReferralCredits("user_1");

    expect(prismaMock.referralCredit.updateMany).toHaveBeenCalledWith({
      where: { id: "credit_1", status: "pending" },
      data: { status: "voided", voidedAt: expect.any(Date), voidReason: "source_order_refunded" },
    });
  });

  it("leaves a credit pending while its source order has an active refund request", async () => {
    prismaMock.referralCredit.findMany.mockResolvedValue([{ id: "credit_1", sourceOrderId: "order_1" }]);
    prismaMock.order.findMany.mockResolvedValue([
      { id: "order_1", paymentStatus: "paid", refundRequests: [{ status: "pending_seller" }] },
    ]);

    await promoteDueReferralCredits("user_1");

    expect(prismaMock.referralCredit.updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing is due", async () => {
    prismaMock.referralCredit.findMany.mockResolvedValue([]);
    await promoteDueReferralCredits("user_1");
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    expect(prismaMock.referralCredit.updateMany).not.toHaveBeenCalled();
  });
});

describe("getAvailableReferralCreditUsd", () => {
  it("returns the summed available balance", async () => {
    prismaMock.referralCredit.aggregate.mockResolvedValue({ _sum: { amountUsd: 20 } });
    const balance = await getAvailableReferralCreditUsd("user_1");
    expect(balance).toBe(20);
  });

  it("returns 0 when there is no available credit", async () => {
    prismaMock.referralCredit.aggregate.mockResolvedValue({ _sum: { amountUsd: null } });
    const balance = await getAvailableReferralCreditUsd("user_1");
    expect(balance).toBe(0);
  });
});

describe("reserveReferralCreditForCheckout / commit / release", () => {
  it("reserves whole credit rows up to the requested cap without overshooting", async () => {
    prismaMock.referralCredit.findMany
      // 1. promoteDueReferralCredits' due-pending lookup — nothing due.
      .mockResolvedValueOnce([])
      // 2. available-credits lookup used to pick which rows to reserve.
      .mockResolvedValueOnce([
        { id: "credit_1", amountUsd: 10 },
        { id: "credit_2", amountUsd: 10 },
      ])
      // 3. post-update "claimed" lookup, confirming what actually got reserved.
      .mockResolvedValueOnce([{ amountUsd: 10 }]);

    const applied = await reserveReferralCreditForCheckout("user_1", 15, "cs_test_123");

    expect(applied).toBe(10);
    expect(prismaMock.referralCredit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["credit_1"] }, status: "available" },
      data: { status: "reserved", reservedForRef: "cs_test_123", reservedAt: expect.any(Date) },
    });
  });

  it("returns 0 and reserves nothing when the cap is 0 or negative", async () => {
    const applied = await reserveReferralCreditForCheckout("user_1", 0, "cs_test_123");
    expect(applied).toBe(0);
    expect(prismaMock.referralCredit.findMany).not.toHaveBeenCalled();
  });

  it("commits reserved credit to spent on checkout success", async () => {
    await commitReferralCreditReservation("cs_test_123", "order_9");
    expect(prismaMock.referralCredit.updateMany).toHaveBeenCalledWith({
      where: { reservedForRef: "cs_test_123", status: "reserved" },
      data: { status: "spent", spentOrderId: "order_9", spentAt: expect.any(Date) },
    });
  });

  it("releases reserved credit back to available on checkout failure", async () => {
    await releaseReferralCreditReservation("cs_test_123");
    expect(prismaMock.referralCredit.updateMany).toHaveBeenCalledWith({
      where: { reservedForRef: "cs_test_123", status: "reserved" },
      data: { status: "available", reservedForRef: null, reservedAt: null },
    });
  });
});
