import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (chaos engineering deep-dive, 2026-07): there was previously no scheduled
// reconciliation between Stripe and the local DB — recovery from a lost/never-delivered webhook
// depended entirely on lazy triggers piggybacked on user traffic. These tests verify the
// reconciliation service (a) replays Stripe objects that are not yet reflected locally through the
// exact same idempotent webhook dispatch, (b) skips objects already marked reconciled, (c) reports
// (never silently drops) truly orphaned Stripe objects with no local record to heal into, and (d)
// isolates one check's failure from the others.

const hoisted = vi.hoisted(() => ({
  processStripeWebhookEvent: vi.fn().mockResolvedValue(undefined),
  resolveOrderIdForDisputedPaymentIntent: vi.fn().mockResolvedValue(null),
  reconcileStalePendingCheckoutSessionsGlobal: vi.fn().mockResolvedValue(0),
  reportCronAnomaly: vi.fn(),
  isStripeConfigured: vi.fn().mockReturnValue(true),
  sessionsList: vi.fn().mockResolvedValue({ data: [] }),
  paymentIntentsList: vi.fn().mockResolvedValue({ data: [] }),
  disputesList: vi.fn().mockResolvedValue({ data: [] }),
  refundsList: vi.fn().mockResolvedValue({ data: [] }),
  chargesRetrieve: vi.fn(),
}));

vi.mock("@/services/payments", () => ({
  processStripeWebhookEvent: hoisted.processStripeWebhookEvent,
  resolveOrderIdForDisputedPaymentIntent: hoisted.resolveOrderIdForDisputedPaymentIntent,
  reconcileStalePendingCheckoutSessionsGlobal: hoisted.reconcileStalePendingCheckoutSessionsGlobal,
}));

vi.mock("@/lib/stripe-charge-order-saved-pm", () => ({
  LIVE_BUY_NOW_PI_KIND: "live_buy_now_saved_pm",
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.reportCronAnomaly,
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: hoisted.isStripeConfigured,
  getStripe: () => ({
    checkout: { sessions: { list: hoisted.sessionsList } },
    paymentIntents: { list: hoisted.paymentIntentsList },
    disputes: { list: hoisted.disputesList },
    refunds: { list: hoisted.refundsList },
    charges: { retrieve: hoisted.chargesRetrieve },
  }),
}));

const webhookEventLogRows: { source: string; externalId: string; processed: boolean }[] = [];

const prismaMock = vi.hoisted(() => ({
  webhookEventLog: {
    findFirst: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
  },
  order: {
    findUnique: vi.fn(),
  },
  liveItemVariantPurchase: {
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("reconcileStripeWithDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webhookEventLogRows.length = 0;
    hoisted.isStripeConfigured.mockReturnValue(true);
    hoisted.sessionsList.mockResolvedValue({ data: [] });
    hoisted.paymentIntentsList.mockResolvedValue({ data: [] });
    hoisted.disputesList.mockResolvedValue({ data: [] });
    hoisted.refundsList.mockResolvedValue({ data: [] });
    hoisted.reconcileStalePendingCheckoutSessionsGlobal.mockResolvedValue(0);
    prismaMock.webhookEventLog.findFirst.mockResolvedValue(null);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue(null);
  });

  it("short-circuits when Stripe is not configured", async () => {
    hoisted.isStripeConfigured.mockReturnValue(false);
    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");

    const report = await reconcileStripeWithDatabase();

    expect(report.configured).toBe(false);
    expect(hoisted.sessionsList).not.toHaveBeenCalled();
  });

  it("replays a paid checkout session whose order exists but isn't yet finalized locally", async () => {
    hoisted.sessionsList.mockResolvedValue({
      data: [{ id: "cs_1", payment_status: "paid", metadata: { kind: "buy_now", orderId: "order_1" } }],
    });
    prismaMock.order.findUnique.mockResolvedValue({ id: "order_1" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    const [eventArg] = hoisted.processStripeWebhookEvent.mock.calls[0] as [{ type: string; data: { object: unknown } }];
    expect(eventArg.type).toBe("checkout.session.completed");
    expect(report.healed).toHaveLength(1);
    expect(report.healed[0]).toMatchObject({ category: "checkout_session", stripeId: "cs_1" });
    expect(report.orphans).toHaveLength(0);
  });

  it("reports (does not silently drop) a paid checkout session with no matching local order", async () => {
    hoisted.sessionsList.mockResolvedValue({
      data: [{ id: "cs_orphan", payment_status: "paid", metadata: { kind: "buy_now", orderId: "order_missing" } }],
    });
    prismaMock.order.findUnique.mockResolvedValue(null);

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(report.orphans).toHaveLength(1);
    expect(report.orphans[0]).toMatchObject({ category: "checkout_session", stripeId: "cs_orphan", orderId: "order_missing" });
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith(
      "stripe-reconcile",
      expect.stringContaining("ORPHAN paid checkout session cs_orphan"),
    );
  });

  it("skips a checkout session already marked reconciled in a prior run", async () => {
    hoisted.sessionsList.mockResolvedValue({
      data: [{ id: "cs_done", payment_status: "paid", metadata: { kind: "buy_now", orderId: "order_1" } }],
    });
    prismaMock.webhookEventLog.findFirst.mockResolvedValue({ id: "log_1" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
    expect(report.healed).toHaveLength(0);
    expect(report.orphans).toHaveLength(0);
  });

  it("ignores checkout sessions that are complete but not actually paid, and ones with no recognizable kind", async () => {
    hoisted.sessionsList.mockResolvedValue({
      data: [
        { id: "cs_unpaid", payment_status: "unpaid", metadata: { kind: "buy_now", orderId: "order_1" } },
        { id: "cs_no_kind", payment_status: "paid", metadata: {} },
      ],
    });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(report.scanned.checkoutSessions).toBe(1); // only the paid one counts as "scanned"
  });

  it("replays a succeeded saved-card PaymentIntent for an order that exists", async () => {
    hoisted.paymentIntentsList.mockResolvedValue({
      data: [{ id: "pi_1", status: "succeeded", metadata: { kind: "pay_order_saved_pm", orderId: "order_2" } }],
    });
    prismaMock.order.findUnique.mockResolvedValue({ id: "order_2" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(report.healed[0]).toMatchObject({ category: "payment_intent", stripeId: "pi_1" });
  });

  it("replays a succeeded saved-card PaymentIntent for a PYT variant purchase", async () => {
    hoisted.paymentIntentsList.mockResolvedValue({
      data: [
        {
          id: "pi_variant",
          status: "succeeded",
          metadata: { kind: "variant_purchase_saved_pm", purchaseId: "vp_1" },
        },
      ],
    });
    prismaMock.liveItemVariantPurchase.findUnique.mockResolvedValue({ id: "vp_1" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(report.healed[0]).toMatchObject({ category: "payment_intent", stripeId: "pi_variant" });
  });

  it("does not reconcile checkout-session-driven PaymentIntent kinds again (avoids double-processing)", async () => {
    hoisted.paymentIntentsList.mockResolvedValue({
      data: [{ id: "pi_cs", status: "succeeded", metadata: { kind: "buy_now", orderId: "order_1" } }],
    });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(report.healed).toHaveLength(0);
    expect(report.orphans).toHaveLength(0);
  });

  it("does not replay an open dispute whose order already shows the payout hold", async () => {
    hoisted.disputesList.mockResolvedValue({
      data: [{ id: "dp_1", status: "needs_response", payment_intent: "pi_dispute" }],
    });
    hoisted.resolveOrderIdForDisputedPaymentIntent.mockResolvedValue("order_3");
    prismaMock.order.findUnique.mockResolvedValue({ payoutStatus: "blocked", paymentStatus: "paid" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(report.healed).toHaveLength(0);
  });

  it("replays an open dispute whose order does not yet show the payout hold", async () => {
    hoisted.disputesList.mockResolvedValue({
      data: [{ id: "dp_2", status: "needs_response", payment_intent: "pi_dispute_2" }],
    });
    hoisted.resolveOrderIdForDisputedPaymentIntent.mockResolvedValue("order_4");
    prismaMock.order.findUnique.mockResolvedValue({ payoutStatus: "eligible", paymentStatus: "paid" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(report.healed[0]).toMatchObject({ category: "dispute", stripeId: "dp_2:needs_response" });
  });

  it("replays a succeeded refund whose order does not yet reflect it", async () => {
    hoisted.refundsList.mockResolvedValue({
      data: [{ id: "re_1", status: "succeeded", payment_intent: "pi_refund", charge: "ch_1" }],
    });
    hoisted.resolveOrderIdForDisputedPaymentIntent.mockResolvedValue("order_5");
    prismaMock.order.findUnique.mockResolvedValue({ paymentStatus: "paid", payoutStatus: "eligible" });
    hoisted.chargesRetrieve.mockResolvedValue({ id: "ch_1", refunded: true, amount: 1000, amount_refunded: 1000, payment_intent: "pi_refund" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.chargesRetrieve).toHaveBeenCalledWith("ch_1");
    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(report.healed[0]).toMatchObject({ category: "refund", stripeId: "re_1" });
  });

  it("isolates a failing check from the others and reports it instead of throwing", async () => {
    hoisted.sessionsList.mockRejectedValue(new Error("stripe outage"));
    hoisted.paymentIntentsList.mockResolvedValue({
      data: [{ id: "pi_ok", status: "succeeded", metadata: { kind: "pay_order_saved_pm", orderId: "order_6" } }],
    });
    prismaMock.order.findUnique.mockResolvedValue({ id: "order_6" });

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(report.errors.some((e) => e.issue.includes("stripe outage"))).toBe(true);
    // Other checks still ran despite the checkout-session check throwing.
    expect(hoisted.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith(
      "stripe-reconcile",
      expect.stringContaining("checkout session list failed"),
    );
  });

  it("also runs the existing stale-pending-order sweep and folds its result into the report", async () => {
    hoisted.reconcileStalePendingCheckoutSessionsGlobal.mockResolvedValue(3);

    const { reconcileStripeWithDatabase } = await import("@/services/stripe-reconciliation");
    const report = await reconcileStripeWithDatabase();

    expect(hoisted.reconcileStalePendingCheckoutSessionsGlobal).toHaveBeenCalledWith(25);
    expect(report.healed.some((h) => h.issue.includes("Finalized 3 stale pending order"))).toBe(true);
  });
});
