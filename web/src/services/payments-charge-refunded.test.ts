import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const chargesRetrieveMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ charges: { retrieve: chargesRetrieveMock } }),
  isStripeConfigured: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
const logSellerCommerceEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/seller-commerce-event", () => ({
  SELLER_COMMERCE_KIND: { orderRefunded: "order_refunded" },
  logSellerCommerceEvent,
}));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({
  emitOrderLifecycleSync: vi.fn(),
  emitLayawayLifecycleSync: vi.fn(),
}));
vi.mock("@/services/shipping/live-shipping-pricing", () => ({
  removeOrderFromLiveShippingSessionOnRefundTx: vi.fn().mockResolvedValue(undefined),
  addOrderToLiveShippingSessionTx: vi.fn().mockResolvedValue(undefined),
  estimateFirstItemLiveShippingCentsForListingTx: vi.fn().mockResolvedValue(0),
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  layawayPayment: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  layaway: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
  },
  liveAuctionInventoryHold: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  listing: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  liveRoom: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  $executeRaw: vi.fn().mockResolvedValue(0),
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { processStripeWebhookEvent, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK } from "@/services/payments";

/** Dispute-resolution reads the order twice: `findFirst` (by PI, to resolve the id) then
 * `findUnique` (by id, for the full select) — see `resolveOrderIdForDisputedPaymentIntent`. */
function mockOrderFoundDirectly(order: Record<string, unknown>) {
  prismaMock.order.findFirst.mockResolvedValue({ id: order.id });
  prismaMock.order.findUnique.mockResolvedValue(order);
}

function chargeRefundedEvent(args: {
  refunded: boolean;
  amountRefunded: number;
  amount: number;
  paymentIntent?: string;
}): Stripe.Event {
  return {
    type: "charge.refunded",
    id: "evt_1",
    data: {
      object: {
        id: "ch_1",
        refunded: args.refunded,
        amount_refunded: args.amountRefunded,
        amount: args.amount,
        payment_intent: args.paymentIntent ?? "pi_1",
      },
    },
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent charge.refunded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("on a partial refund, does not cancel/refund-flag the order but flags payout for manual review", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: "ord_1", sellerId: "seller_1", payoutStatus: "held", listing: { title: "Test Card" } },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: false, amountRefunded: 500, amount: 10000 }),
    );

    // Partial refunds are unsupported as a full order-refund flow — no cancel/refund-flag.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    // But the seller must not still get paid out in full on a charge that was partially clawed back.
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", payoutStatus: { not: "manual_review" } },
        data: { payoutStatus: "manual_review", payoutBlockedReason: "partial_refund_needs_review" },
      }),
    );
    expect(logSellerCommerceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "seller_1", orderId: "ord_1", kind: "order_partial_refund_needs_review" }),
    );
  });

  it("does not re-notify on a redelivered partial-refund webhook once already flagged for manual review", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: "ord_1b", sellerId: "seller_1", payoutStatus: "manual_review", listing: { title: "Test Card" } },
    ]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: false, amountRefunded: 500, amount: 10000 }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(logSellerCommerceEvent).not.toHaveBeenCalled();
  });

  it("skips the manual-review flag for a layaway's deliberate default-time tax refund (already-terminal plan)", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_lay_1",
        sellerId: "seller_1",
        payoutStatus: "held",
        paymentMethod: "layaway",
        listing: { title: "Layaway item" },
        layaway: { status: "defaulted" },
      },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: false, amountRefunded: 825, amount: 25_825 }),
    );

    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(logSellerCommerceEvent).not.toHaveBeenCalled();
  });

  it("still flags manual review for a partial refund on a layaway that is still active (genuinely unexpected)", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_lay_2",
        sellerId: "seller_1",
        payoutStatus: "held",
        paymentMethod: "layaway",
        listing: { title: "Layaway item" },
        layaway: { status: "active" },
      },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: false, amountRefunded: 825, amount: 25_825 }),
    );

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_lay_2", payoutStatus: { not: "manual_review" } },
        data: { payoutStatus: "manual_review", payoutBlockedReason: "partial_refund_needs_review" },
      }),
    );
  });

  it("on a full refund, blocks payout and marks the order refunded/cancelled", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_1",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        paymentStatus: "paid",
        payoutStatus: "held",
        taxAmountCents: 350,
        listing: { title: "Test Card" },
      },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: true, amountRefunded: 10000, amount: 10000 }),
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1" },
        data: expect.objectContaining({
          paymentStatus: PAYMENT_REFUNDED,
          status: "cancelled",
          payoutStatus: "blocked",
          payoutBlockedReason: "refunded",
          taxRefundedCents: 350,
        }),
      }),
    );
  });

  it("is idempotent: skips orders already fully processed (paymentStatus refunded + payout blocked)", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_2",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        paymentStatus: "refunded",
        payoutStatus: "blocked",
        taxAmountCents: 0,
        listing: { title: "Test Card" },
      },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: true, amountRefunded: 10000, amount: 10000 }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("acts as a safety net for refunds issued directly in Stripe (order not yet blocked)", async () => {
    // paymentStatus is already "refunded" (e.g. a prior partial webhook or manual DB fix) but
    // payoutStatus was never blocked — must still not skip, or the seller could be paid out on a
    // fully refunded order.
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_3",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        paymentStatus: "refunded",
        payoutStatus: "held",
        taxAmountCents: 0,
        listing: { title: "Test Card" },
      },
    ]);

    await processStripeWebhookEvent(
      chargeRefundedEvent({ refunded: true, amountRefunded: 10000, amount: 10000 }),
    );

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payoutStatus: "blocked" }),
      }),
    );
  });

  it("rolls back live-show GMV on a full refund so later sales aren't taxed at a stale, too-low tier", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_live_1",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        paymentStatus: "paid",
        payoutStatus: "held",
        taxAmountCents: 0,
        itemPriceUsd: 250,
        listing: { title: "Live sale card" },
        liveShippingSession: { liveShowId: "room_1" },
      },
    ]);

    await processStripeWebhookEvent(chargeRefundedEvent({ refunded: true, amountRefunded: 10000, amount: 10000 }));

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prismaMock.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toContain('UPDATE "LiveRoom"');
    expect(values).toContain("room_1");
    expect(values).toContain(250);
  });

  it("does not touch live-show GMV for non-live orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "ord_mp_1",
        buyerId: "buyer_1",
        sellerId: "seller_1",
        listingId: "lst_1",
        paymentStatus: "paid",
        payoutStatus: "held",
        taxAmountCents: 0,
        itemPriceUsd: 50,
        listing: { title: "Marketplace card" },
        liveShippingSession: null,
      },
    ]);

    await processStripeWebhookEvent(chargeRefundedEvent({ refunded: true, amountRefunded: 5000, amount: 5000 }));

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });
});

function disputeEvent(args: { type: "charge.dispute.created" | "charge.dispute.closed"; status?: string }): Stripe.Event {
  return {
    type: args.type,
    id: "evt_dispute_1",
    data: {
      object: {
        id: "dp_1",
        charge: "ch_1",
        status: args.status ?? "warning_needs_response",
      },
    },
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent charge.dispute.*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargesRetrieveMock.mockResolvedValue({ payment_intent: "pi_1" });
  });

  it("freezes payout when a dispute is opened on an order not yet paid out", async () => {
    mockOrderFoundDirectly({
      id: "ord_1",
      sellerId: "seller_1",
      payoutStatus: "held",
      listing: { title: "Test Card" },
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.created" }));

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", payoutStatus: { not: "paid_out" } },
        data: { payoutStatus: "blocked", payoutBlockedReason: "disputed" },
      }),
    );
  });

  it("flags for manual review instead of silently blocking when the order was already paid out", async () => {
    mockOrderFoundDirectly({
      id: "ord_2",
      sellerId: "seller_1",
      payoutStatus: "paid_out",
      listing: { title: "Test Card" },
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.created" }));

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_2" },
        data: { payoutStatus: "manual_review", payoutBlockedReason: "disputed_after_payout" },
      }),
    );
  });

  it("unblocks payout when a dispute is won, but only if this handler set the hold", async () => {
    mockOrderFoundDirectly({
      id: "ord_3",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      listingId: "lst_1",
      paymentMethod: "stripe",
      payoutBlockedReason: "disputed",
      itemPriceUsd: 80,
      taxAmountCents: 0,
      listing: { title: "Test Card" },
      liveShippingSession: null,
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.closed", status: "won" }));

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_3", payoutBlockedReason: "disputed" },
        data: { payoutStatus: "held", payoutBlockedReason: null },
      }),
    );
  });

  it("marks a lost dispute as a permanent chargeback, blocking payout and reversing tax", async () => {
    mockOrderFoundDirectly({
      id: "ord_4",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      listingId: "lst_1",
      paymentMethod: "stripe",
      payoutBlockedReason: "disputed",
      itemPriceUsd: 120,
      taxAmountCents: 900,
      listing: { title: "Test Card" },
      liveShippingSession: null,
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.closed", status: "lost" }));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_4" },
        data: expect.objectContaining({
          paymentStatus: PAYMENT_CHARGEBACK,
          status: "cancelled",
          payoutStatus: "blocked",
          payoutBlockedReason: "chargeback",
          taxRefundedCents: 900,
        }),
      }),
    );
  });

  it("resolves the order via LayawayPayment when the disputed PI isn't the one stored on Order (layaway installment dispute)", async () => {
    // Order.stripePaymentIntentId only ever holds the *last* layaway payment's PI — a dispute on
    // an earlier installment (e.g. the deposit) must still be found and frozen.
    prismaMock.order.findFirst.mockResolvedValue(null);
    prismaMock.layawayPayment.findFirst.mockResolvedValue({ layaway: { orderId: "ord_layaway_1" } });
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_layaway_1",
      sellerId: "seller_1",
      payoutStatus: "pending",
      listing: { title: "Layaway Card" },
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.created" }));

    expect(prismaMock.layawayPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripePaymentIntentId: "pi_1" } }),
    );
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_layaway_1", payoutStatus: { not: "paid_out" } },
        data: { payoutStatus: "blocked", payoutBlockedReason: "disputed" },
      }),
    );
  });

  it("on a lost dispute for a still-active layaway, refunds the plan and re-lists the item instead of ending it", async () => {
    mockOrderFoundDirectly({
      id: "ord_layaway_2",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      listingId: "lst_layaway_2",
      paymentMethod: "layaway",
      payoutBlockedReason: "disputed",
      itemPriceUsd: 200,
      taxAmountCents: 0,
      listing: { title: "Layaway Card" },
      liveShippingSession: null,
    });
    prismaMock.layaway.findFirst.mockResolvedValue({
      id: "lay_1",
      status: "active",
      listingId: "lst_layaway_2",
      buyerId: "buyer_1",
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.closed", status: "lost" }));

    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lay_1" },
        data: { status: "refunded", remainingBalanceUsd: 0 },
      }),
    );
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lst_layaway_2", status: "layaway_reserved" },
        data: { status: "active", allowOffers: true },
      }),
    );
  });

  it("on a lost dispute for an already-completed layaway, marks the plan refunded without re-listing the (likely shipped) item", async () => {
    mockOrderFoundDirectly({
      id: "ord_layaway_3",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      listingId: "lst_layaway_3",
      paymentMethod: "layaway",
      payoutBlockedReason: "disputed",
      itemPriceUsd: 200,
      taxAmountCents: 0,
      listing: { title: "Layaway Card" },
      liveShippingSession: null,
    });
    prismaMock.layaway.findFirst.mockResolvedValue({
      id: "lay_2",
      status: "completed",
      listingId: "lst_layaway_3",
      buyerId: "buyer_1",
    });

    await processStripeWebhookEvent(disputeEvent({ type: "charge.dispute.closed", status: "lost" }));

    expect(prismaMock.layaway.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lay_2" }, data: { status: "refunded" } }),
    );
    // Generic sold -> ended listing update already covers the completed-layaway case.
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lst_layaway_3", status: "sold" }, data: { status: "ended" } }),
    );
  });
});
