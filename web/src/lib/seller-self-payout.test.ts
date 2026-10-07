import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn() },
    payoutEligibilityAuditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  listReady: vi.fn(),
  release: vi.fn(),
  notify: vi.fn(),
  balance: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/admin/orders-ready-for-bank-payout", () => ({
  listOrdersReadyForAdminBankPayout: hoisted.listReady,
}));
vi.mock("@/lib/admin/release-seller-bank-payouts", () => ({
  releaseSellerReadyBankPayouts: hoisted.release,
}));
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins: hoisted.notify }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ balance: { retrieve: hoisted.balance } }),
}));

import {
  SELLER_SELF_PAYOUT_COOLDOWN_MS,
  decideSelfPayoutState,
  getSellerSelfPayoutSummary,
  initiateSellerSelfPayout,
  planSelfPayout,
} from "@/lib/seller-self-payout";

const NOW = new Date("2026-10-07T12:00:00Z");

function readyRow(orderId: string, net: number, shippedAt = "2026-10-01T00:00:00Z", session: string | null = null) {
  return {
    orderId,
    sellerId: "s1",
    estimatedNetUsd: net,
    shippedAt,
    createdAt: shippedAt,
    liveShippingSessionId: session,
  };
}

describe("planSelfPayout", () => {
  it("never plans more than the available balance and stops at the first order that does not fit", () => {
    const plan = planSelfPayout({
      ordersOldestFirst: [
        { orderId: "a", estimatedNetUsd: 40 },
        { orderId: "b", estimatedNetUsd: 70 },
        { orderId: "c", estimatedNetUsd: 5 },
      ],
      availableUsdCents: 10_000,
    });
    expect(plan.payableOrderIds).toEqual(["a"]);
    expect(plan.payableCents).toBe(4000);
  });

  it("pays nothing when the balance is empty", () => {
    expect(
      planSelfPayout({ ordersOldestFirst: [{ orderId: "a", estimatedNetUsd: 40 }], availableUsdCents: 0 }),
    ).toEqual({ payableOrderIds: [], payableCents: 0 });
  });
});

describe("decideSelfPayoutState", () => {
  const base = { blockedReason: null, readyOrderCount: 2, payableCents: 15_000, minimumCents: 10_000, cooldownEndsAt: null, now: NOW };
  it("allows a normal payout", () => {
    expect(decideSelfPayoutState(base)).toEqual({ state: "ready", canInitiate: true });
  });
  it("blocks below the minimum", () => {
    expect(decideSelfPayoutState({ ...base, payableCents: 9_999 }).state).toBe("below_minimum");
  });
  it("blocks during the cooldown but not after it", () => {
    expect(decideSelfPayoutState({ ...base, cooldownEndsAt: new Date(NOW.getTime() + 1000) }).state).toBe("cooldown");
    expect(decideSelfPayoutState({ ...base, cooldownEndsAt: new Date(NOW.getTime() - 1000) }).state).toBe("ready");
  });
  it("reports nothing ready when no orders or no balance", () => {
    expect(decideSelfPayoutState({ ...base, readyOrderCount: 0 }).state).toBe("nothing_ready");
    expect(decideSelfPayoutState({ ...base, payableCents: 0 }).state).toBe("nothing_ready");
  });
  it("lets an account problem win over everything else", () => {
    expect(decideSelfPayoutState({ ...base, blockedReason: "stripe_payouts_disabled" }).state).toBe("blocked");
  });
});

describe("seller payout flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.prisma.user.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.stripeAccountId
        ? { stripeAccountId: "acct_1", stripeOnboardingComplete: true, stripePayoutsEnabled: true }
        : { username: "bob" },
    );
    hoisted.prisma.order.findMany.mockResolvedValue([]);
    hoisted.prisma.payoutEligibilityAuditLog.findFirst.mockResolvedValue(null);
    hoisted.prisma.payoutEligibilityAuditLog.create.mockResolvedValue({ id: "claim1" });
    hoisted.prisma.payoutEligibilityAuditLog.update.mockResolvedValue({});
    hoisted.prisma.payoutEligibilityAuditLog.delete.mockResolvedValue({});
    hoisted.prisma.$queryRaw.mockResolvedValue([]);
    hoisted.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(hoisted.prisma));
    hoisted.listReady.mockResolvedValue([readyRow("o1", 70), readyRow("o2", 50)]);
    hoisted.balance.mockResolvedValue({ available: [{ amount: 20_000, currency: "usd" }] });
  });

  it("summarises exactly what a tap would send", async () => {
    const s = await getSellerSelfPayoutSummary("s1", NOW);
    expect(s.state).toBe("ready");
    expect(s.canInitiate).toBe(true);
    expect(s.payableUsd).toBe(120);
    expect(s.payableOrderCount).toBe(2);
    expect(hoisted.listReady).toHaveBeenCalledWith(1000, { sellerId: "s1" });
  });

  it("holds back orders from a live show whose other orders have not shipped", async () => {
    hoisted.listReady.mockResolvedValue([readyRow("o1", 70, undefined, "sess1"), readyRow("o2", 150)]);
    hoisted.prisma.order.findMany.mockResolvedValue([
      { liveShippingSessionId: "sess1", shippedAt: new Date(), carrierAcceptedAt: null, fulfillmentStatus: null, status: "shipped" },
      { liveShippingSessionId: "sess1", shippedAt: null, carrierAcceptedAt: null, fulfillmentStatus: "pending", status: "paid" },
    ]);
    const s = await getSellerSelfPayoutSummary("s1", NOW);
    expect(s.payableUsd).toBe(150);
  });

  it("is blocked when Stripe has paused payouts", async () => {
    hoisted.prisma.user.findUnique.mockResolvedValue({
      stripeAccountId: "acct_1",
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: false,
    });
    const s = await getSellerSelfPayoutSummary("s1", NOW);
    expect(s.state).toBe("blocked");
    expect(hoisted.balance).not.toHaveBeenCalled();
  });

  it("pays out without forcing past the shipping checks, then alerts admins", async () => {
    hoisted.release.mockResolvedValue({ ok: true, pushed: 2, skipped: 0, failed: 0, totalPaidUsd: 120, remainingAvailableUsd: 80, results: [] });
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(true);
    expect(hoisted.release).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "s1", adminId: null, force: false }),
    );
    expect(hoisted.notify).toHaveBeenCalledTimes(1);
    expect(hoisted.prisma.payoutEligibilityAuditLog.delete).not.toHaveBeenCalled();
  });

  it("refuses a second payout inside the cooldown without touching Stripe", async () => {
    const recent = { createdAt: new Date(Date.now() - 3_600_000) };
    hoisted.prisma.payoutEligibilityAuditLog.findFirst.mockResolvedValue(recent);
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cooldown");
    expect(hoisted.release).not.toHaveBeenCalled();
    expect(SELLER_SELF_PAYOUT_COOLDOWN_MS).toBe(86_400_000);
  });

  it("refuses a tap that lost the race for the cooldown slot", async () => {
    // Summary sees no recent payout, but by the time we claim, another tap has won.
    hoisted.prisma.payoutEligibilityAuditLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ createdAt: new Date() });
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(false);
    expect(hoisted.release).not.toHaveBeenCalled();
    expect(hoisted.prisma.payoutEligibilityAuditLog.create).not.toHaveBeenCalled();
  });

  it("gives the cooldown slot back when nothing was sent", async () => {
    hoisted.release.mockResolvedValue({ ok: true, pushed: 0, skipped: 0, failed: 1, totalPaidUsd: 0, remainingAvailableUsd: 120, results: [] });
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(false);
    expect(hoisted.prisma.payoutEligibilityAuditLog.delete).toHaveBeenCalledWith({ where: { id: "claim1" } });
    expect(hoisted.notify).not.toHaveBeenCalled();
  });

  it("gives the cooldown slot back and reports a failure if the release throws", async () => {
    hoisted.release.mockRejectedValue(new Error("stripe down"));
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(false);
    expect(hoisted.prisma.payoutEligibilityAuditLog.delete).toHaveBeenCalled();
  });

  it("does not start when below the minimum", async () => {
    hoisted.listReady.mockResolvedValue([readyRow("o1", 99)]);
    const r = await initiateSellerSelfPayout("s1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("below_minimum");
    expect(hoisted.release).not.toHaveBeenCalled();
  });
});
