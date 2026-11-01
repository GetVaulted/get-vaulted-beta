import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/require-admin", () => ({ requireAdmin }));

const riskHold = vi.hoisted(() => vi.fn());
vi.mock("@/lib/buyer-payment-risk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/buyer-payment-risk")>()),
  loadRiskySalePayoutHold: riskHold,
}));
vi.mock("@/lib/admin/admin-linked-accounts", () => ({
  findLinkedAccountsForUser: vi.fn(async () => ({ userId: "u1", peers: [{ userId: "u9" }] })),
}));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  order: { aggregate: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  platformCredit: { aggregate: vi.fn() },
  referralCredit: { aggregate: vi.fn() },
  stripeDispute: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/admin/admin-disputes", () => ({
  OPEN_DISPUTE_STATUSES: ["needs_response", "warning_needs_response", "under_review", "warning_under_review"],
  NEEDS_RESPONSE_STATUSES: ["needs_response", "warning_needs_response"],
}));

import { GET } from "@/app/api/admin/users/[id]/summary/route";
import type { AdminUserSummary } from "@/app/api/admin/users/[id]/summary/route";

const ctx = { params: Promise.resolve({ id: "u1" }) };

function baseUser(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    username: "vaultking_rae",
    name: "Rae Thompson",
    email: "rae@example.com",
    emailVerified: new Date(),
    phoneE164: "+14025550148",
    phoneVerifiedAt: new Date(),
    role: "user",
    createdAt: new Date("2026-03-12T00:00:00Z"),
    suspendedAt: null,
    stripeAccountId: "acct_1",
    payoutRiskLevel: "medium",
    purchasesLockedAt: null,
    purchasesLockReason: null,
    sellerLockedAt: null,
    sellerLockReason: null,
    ...over,
  };
}

describe("GET /api/admin/users/[id]/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ ok: true, userId: "admin_1" });
    prismaMock.user.findUnique.mockResolvedValue(baseUser());
    prismaMock.order.aggregate
      .mockResolvedValueOnce({ _count: 38, _sum: { totalUsd: 4820 } }) // as buyer
      .mockResolvedValueOnce({ _count: 112, _sum: { totalUsd: 12460 } }); // as seller
    prismaMock.order.findMany
      .mockResolvedValueOnce([
        { id: "o_big", totalUsd: 640 },
        { id: "o_small", totalUsd: 40 },
      ]) // unpaid sales
      .mockResolvedValueOnce([{ id: "o_big" }, { id: "o_buy" }]) // all my order ids
      .mockResolvedValueOnce([]); // recent orders
    prismaMock.order.count
      .mockResolvedValueOnce(2) // refunded/charged back
      .mockResolvedValueOnce(150) // all paid-ish
      .mockResolvedValueOnce(0); // failed in 24h
    prismaMock.platformCredit.aggregate.mockResolvedValue({ _sum: { amountUsd: 25 } });
    prismaMock.referralCredit.aggregate.mockResolvedValue({ _sum: { amountUsd: 10 } });
    prismaMock.stripeDispute.findMany.mockResolvedValue([
      { status: "needs_response", amountCents: 22500, evidenceDueBy: new Date("2026-11-11T23:59:59Z") },
      { status: "lost", amountCents: 126000, evidenceDueBy: null },
    ]);
    riskHold.mockResolvedValue({ held: true, holdUntil: new Date("2026-11-01T23:18:48Z"), reasons: ["new_buyer"] });
  });

  it("returns 403 from the admin gate untouched", async () => {
    const denied = new Response("no", { status: 403 });
    requireAdmin.mockResolvedValue({ ok: false, response: denied });
    expect(await GET(new Request("http://x"), ctx)).toBe(denied);
  });

  it("404s an unknown user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await GET(new Request("http://x"), ctx)).status).toBe(404);
  });

  it("summarises money, disputes, credit and risk, and lists what needs attention", async () => {
    const body = (await (await GET(new Request("http://x"), ctx)).json()) as AdminUserSummary;
    expect(body.buyer).toEqual({ paidOrders: 38, spentUsd: 4820 });
    expect(body.seller).toMatchObject({ paidSales: 112, soldUsd: 12460, unpaidSales: 2, unpaidUsd: 680, heldUsd: 640 });
    // Only the $250+ unpaid sale is checked for the fraud hold.
    expect(riskHold).toHaveBeenCalledTimes(1);
    expect(riskHold).toHaveBeenCalledWith("o_big");
    expect(body.refunds.ratePct).toBeCloseTo(1.333, 2);
    expect(body.disputes).toMatchObject({ open: 1, lost: 1, won: 0, openUsd: 225 });
    expect(body.storeCreditUsd).toBe(35);
    expect(body.linkedAccounts).toBe(1);
    expect(body.user).toMatchObject({ isSeller: true, phoneVerified: true, purchasesLocked: false });
    expect(body.alerts.map((a) => a.text)).toEqual([
      "Dispute needs a response: $225.00 · due Nov 11",
      "$640.00 payout on 14-day fraud hold until Nov 1",
    ]);
  });

  it("puts locks and suspension first, as danger alerts", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      baseUser({ suspendedAt: new Date("2026-10-30T12:00:00Z"), purchasesLockedAt: new Date(), purchasesLockReason: "auto_failed_payments" }),
    );
    const body = (await (await GET(new Request("http://x"), ctx)).json()) as AdminUserSummary;
    expect(body.alerts[0]).toMatchObject({ tone: "danger", text: "Account suspended since Oct 30" });
    expect(body.alerts[1]).toMatchObject({ tone: "danger" });
    expect(body.alerts[1].text).toMatch(/locked automatically/);
  });
});
