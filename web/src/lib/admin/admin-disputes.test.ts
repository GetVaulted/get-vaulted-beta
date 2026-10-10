import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  stripeDispute: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  order: { findUnique: vi.fn().mockResolvedValue({ sellerId: "s1" }) },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { disputeRowFromStripe, recordStripeDispute, saveDisputeEvidence } from "./admin-disputes";

const dispute = (over: Record<string, unknown> = {}) =>
  ({
    id: "dp_1",
    charge: "ch_1",
    payment_intent: "pi_1",
    amount: 2500,
    currency: "usd",
    reason: "product_not_received",
    status: "needs_response",
    created: 1_790_000_000,
    evidence_details: { due_by: 1_790_500_000, has_evidence: false, past_due: false, submission_count: 0 },
    ...over,
  }) as never;

describe("disputeRowFromStripe", () => {
  it("maps due date, amount and open state", () => {
    const row = disputeRowFromStripe(dispute(), "o1");
    expect(row).toMatchObject({ id: "dp_1", orderId: "o1", chargeId: "ch_1", paymentIntentId: "pi_1", amountCents: 2500, closedAt: null });
    expect(row.evidenceDueBy?.getTime()).toBe(1_790_500_000 * 1000);
  });
  it("marks won/lost disputes closed", () => {
    expect(disputeRowFromStripe(dispute({ status: "lost" }), null).closedAt).toBeInstanceOf(Date);
  });
  it("handles expanded charge objects", () => {
    expect(disputeRowFromStripe(dispute({ charge: { id: "ch_9" }, payment_intent: null }), null)).toMatchObject({ chargeId: "ch_9", paymentIntentId: null });
  });
});

describe("recordStripeDispute", () => {
  beforeEach(() => vi.clearAllMocks());
  it("never throws into payment handling", async () => {
    prismaMock.stripeDispute.upsert.mockRejectedValueOnce(new Error("db down"));
    await expect(recordStripeDispute(dispute(), "o1")).resolves.toBeUndefined();
  });
  it("does not overwrite a known order link with null", async () => {
    await recordStripeDispute(dispute(), null);
    const call = prismaMock.stripeDispute.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("orderId");
  });
});

describe("saveDisputeEvidence", () => {
  beforeEach(() => vi.clearAllMocks());
  const stripe = { disputes: { update: vi.fn().mockResolvedValue(dispute({ status: "under_review" })) } } as never;

  it("refuses when Stripe is no longer taking evidence", async () => {
    prismaMock.stripeDispute.findUnique.mockResolvedValue({ id: "dp_1", status: "won", orderId: "o1" });
    await expect(
      saveDisputeEvidence(stripe, { adminUserId: "a", disputeId: "dp_1", evidence: { customerName: "x" }, submit: true, reason: "because" }),
    ).rejects.toMatchObject({ code: "NOT_ACCEPTING_EVIDENCE" });
  });
  it("refuses empty evidence", async () => {
    prismaMock.stripeDispute.findUnique.mockResolvedValue({ id: "dp_1", status: "needs_response", orderId: "o1" });
    await expect(
      saveDisputeEvidence(stripe, { adminUserId: "a", disputeId: "dp_1", evidence: { customerName: "  " }, submit: false, reason: "because" }),
    ).rejects.toMatchObject({ code: "EMPTY_EVIDENCE" });
  });
  it("sends evidence with the right submit flag and logs it", async () => {
    prismaMock.stripeDispute.findUnique.mockResolvedValue({ id: "dp_1", status: "needs_response", orderId: "o1" });
    const out = await saveDisputeEvidence(stripe, {
      adminUserId: "a",
      disputeId: "dp_1",
      evidence: { customerName: "Kem", shippingTrackingNumber: "9400" },
      submit: false,
      reason: "tracking shows delivered",
    });
    expect(out).toEqual({ status: "under_review", submitted: false });
    expect((stripe as never as { disputes: { update: ReturnType<typeof vi.fn> } }).disputes.update).toHaveBeenCalledWith("dp_1", {
      evidence: { customer_name: "Kem", shipping_tracking_number: "9400" },
      submit: false,
    });
    expect(prismaMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "dispute.save_evidence_draft", targetUserId: "s1" }) }),
    );
  });
});
