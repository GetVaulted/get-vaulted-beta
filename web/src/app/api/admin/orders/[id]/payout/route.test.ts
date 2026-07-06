import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }),
}));

const logPayoutEligibilityDecision = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/payout-audit-log", () => ({ logPayoutEligibilityDecision }));

const releaseEscrowFundsFromApproved = vi.hoisted(() => vi.fn());
const hoistedErrors = vi.hoisted(() => ({
  EscrowReleaseAlreadyInFlightError: class EscrowReleaseAlreadyInFlightError extends Error {},
}));
vi.mock("@/services/escrow/release-when-approved", () => ({
  releaseEscrowFundsFromApproved,
  EscrowReleaseAlreadyInFlightError: hoistedErrors.EscrowReleaseAlreadyInFlightError,
}));
vi.mock("@/services/escrow/state-machine", () => ({
  assertValidEscrowTransition: vi.fn(),
  EscrowInvalidTransitionError: class EscrowInvalidTransitionError extends Error {},
}));
vi.mock("@/services/payout/process-delivery-payout", () => ({
  processDeliveryPayoutEvaluation: vi.fn().mockResolvedValue(undefined),
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  orderRefundRequest: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/admin/orders/[id]/payout/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/admin/orders/ord_1/payout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const baseOrder = {
  id: "ord_1",
  sellerId: "seller_1",
  listingId: "lst_1",
  paymentStatus: "paid",
  paymentMethod: "stripe",
  fulfillmentStatus: "delivered",
  payoutStatus: "pending",
  escrowStatus: null,
  escrowTransactionId: null,
  escrowProvider: null,
  escrowReleasePaused: false,
  fundsReleasedAt: null,
  deliveryConfirmedAt: new Date(),
  seller: { stripeAccountId: "acct_1", stripeOnboardingComplete: true, stripePayoutsEnabled: true },
};

describe("POST /api/admin/orders/[id]/payout — release_payout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);
  });

  it("releases payout normally when there is no active refund request", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);

    const res = await POST(buildRequest({ action: "release_payout", reason: "manual release" }), {
      params: Promise.resolve({ id: "ord_1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payoutStatus: "paid_out" }) }),
    );
  });

  // Regression (chaos audit): refund-during-payout race.
  it("blocks payout release when the order has an active refund request", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue({ id: "rr_1", status: "pending_seller" });

    const res = await POST(buildRequest({ action: "release_payout", reason: "manual release" }), {
      params: Promise.resolve({ id: "ord_1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/active refund request/i);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("returns 409 instead of crashing when an escrow release is already in flight (concurrent admin click)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...baseOrder,
      paymentMethod: "escrow",
      escrowStatus: "approved",
      escrowTransactionId: "esc_1",
    });
    releaseEscrowFundsFromApproved.mockRejectedValue(
      new hoistedErrors.EscrowReleaseAlreadyInFlightError("already in flight"),
    );

    const res = await POST(buildRequest({ action: "release_payout", reason: "manual release" }), {
      params: Promise.resolve({ id: "ord_1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already in progress/i);
  });
});
