import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn(), updateMany: vi.fn() },
  },
  listReady: vi.fn(),
  planOnly: vi.fn(),
  balance: vi.fn(),
  payoutCreate: vi.fn(),
  audit: vi.fn(),
  liabPlan: vi.fn(),
  liabApply: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/admin/orders-ready-for-bank-payout", () => ({ listOrdersReadyForAdminBankPayout: hoisted.listReady }));
vi.mock("@/lib/payout-audit-log", () => ({ logPayoutEligibilityDecision: hoisted.audit }));
vi.mock("@/services/payout/stripe-seller-payout", () => ({ releaseSellerStripePayout: hoisted.planOnly }));
vi.mock("@/services/shipping/label-liability-recovery", () => ({
  planOutstandingLiabilityRecoveryForSeller: hoisted.liabPlan,
  applyOutstandingLiabilityRecovery: hoisted.liabApply,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ balance: { retrieve: hoisted.balance }, payouts: { create: hoisted.payoutCreate } }),
}));

import { finalizeLumpCents, releaseSellerLumpBankPayout } from "@/lib/admin/release-seller-lump-payout";

const row = (orderId: string, net: number, day: number) => ({
  orderId,
  sellerId: "s1",
  estimatedNetUsd: net,
  shippedAt: `2026-10-0${day}T00:00:00Z`,
  createdAt: `2026-10-0${day}T00:00:00Z`,
});

describe("finalizeLumpCents", () => {
  it("sweeps the leftover when an order does not fit", () => {
    const r = finalizeLumpCents({
      plannedCentsOldestFirst: [
        { orderId: "a", cents: 10_000 },
        { orderId: "b", cents: 10_000 },
        { orderId: "c", cents: 10_000 },
      ],
      availableCents: 23_514,
      sweepCapCents: 0,
    });
    expect(r.includedOrderIds).toEqual(["a", "b"]);
    expect(r.lumpCents).toBe(23_514);
  });

  it("caps the sweep at the next ready order's net when every planned order fit", () => {
    const r = finalizeLumpCents({
      plannedCentsOldestFirst: [{ orderId: "a", cents: 10_000 }],
      availableCents: 50_000,
      sweepCapCents: 2_500,
    });
    expect(r.lumpCents).toBe(12_500);
  });

  it("never exceeds the live balance", () => {
    const r = finalizeLumpCents({
      plannedCentsOldestFirst: [{ orderId: "a", cents: 10_000 }],
      availableCents: 4_000,
      sweepCapCents: 0,
    });
    expect(r.includedOrderIds).toEqual([]);
    expect(r.lumpCents).toBe(4_000);
  });
});

describe("releaseSellerLumpBankPayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.prisma.user.findUnique.mockResolvedValue({
      stripeAccountId: "acct_1",
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
    });
    hoisted.balance.mockResolvedValue({ available: [{ amount: 23_514, currency: "usd" }] });
    hoisted.listReady.mockResolvedValue([row("a", 100, 1), row("b", 100, 2), row("c", 100, 3)]);
    hoisted.planOnly.mockImplementation(async () => ({ ok: true, reason: "planned", amountCents: 10_000 }));
    hoisted.liabPlan.mockResolvedValue({ items: [], totalCents: 0 });
    hoisted.payoutCreate.mockResolvedValue({ id: "po_lump1" });
    hoisted.prisma.order.findMany.mockResolvedValue([
      { id: "a", payoutStatus: "fast_payout_ready", fundsReleasedAt: null },
      { id: "b", payoutStatus: "fast_payout_ready", fundsReleasedAt: null },
    ]);
    hoisted.prisma.order.updateMany.mockResolvedValue({ count: 2 });
  });

  it("creates exactly ONE Stripe payout for the whole balance and settles the covered orders with it", async () => {
    const r = await releaseSellerLumpBankPayout({ sellerId: "s1", adminId: null, reason: "t", force: false });
    expect(hoisted.payoutCreate).toHaveBeenCalledTimes(1);
    expect(hoisted.payoutCreate.mock.calls[0]![0]).toMatchObject({ amount: 23_514, currency: "usd" });
    expect(hoisted.planOnly).toHaveBeenCalledWith("a", { force: false, planOnly: true });
    expect(r.totalPaidUsd).toBe(235.14);
    expect(r.pushed).toBe(2);
    expect(r.payoutId).toBe("po_lump1");
    const data = hoisted.prisma.order.updateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({ payoutStatus: "paid_out", processorTransferId: "po_lump1" });
    expect(hoisted.audit).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when a safety check blocks every order and the balance can't cover one", async () => {
    hoisted.balance.mockResolvedValue({ available: [] });
    const r = await releaseSellerLumpBankPayout({ sellerId: "s1", adminId: null, reason: "t", force: false });
    expect(hoisted.payoutCreate).not.toHaveBeenCalled();
    expect(r.pushed).toBe(0);
    expect(r.totalPaidUsd).toBe(0);
  });

  it("does not pay orders a safety check rejected (e.g. live show not fully shipped)", async () => {
    hoisted.planOnly.mockImplementation(async (id: string) =>
      id === "a" ? { ok: false, reason: "live_session_not_fully_shipped" } : { ok: true, reason: "planned", amountCents: 10_000 },
    );
    hoisted.prisma.order.findMany.mockResolvedValue([{ id: "b", payoutStatus: "fast_payout_ready", fundsReleasedAt: null }]);
    const r = await releaseSellerLumpBankPayout({ sellerId: "s1", adminId: null, reason: "t", force: false });
    expect(r.failed).toBe(1);
    expect(r.results.find((x) => x.orderId === "a")?.ok).toBe(false);
    expect(hoisted.payoutCreate.mock.calls[0]![0].amount).toBeLessThanOrEqual(23_514);
  });

  it("takes outstanding label liability out of the single payout", async () => {
    hoisted.liabPlan.mockResolvedValue({ items: [{}], totalCents: 500 });
    await releaseSellerLumpBankPayout({ sellerId: "s1", adminId: null, reason: "t", force: false });
    expect(hoisted.payoutCreate.mock.calls[0]![0].amount).toBe(23_014);
    expect(hoisted.liabApply).toHaveBeenCalledTimes(1);
  });
});
