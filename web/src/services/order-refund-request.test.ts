import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/seller-commerce-event", () => ({
  SELLER_COMMERCE_KIND: { orderRefunded: "order_refunded" },
  logSellerCommerceEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({ emitOrderLifecycleSync: vi.fn() }));
vi.mock("@/services/shipping/live-shipping-pricing", () => ({
  removeOrderFromLiveShippingSessionOnRefundTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/live-show-gmv", () => ({ reverseLiveShowCompletedSaleTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/payments", () => ({ PAYMENT_REFUNDED: "refunded" }));
const logPayoutEligibilityDecision = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/payout-audit-log", () => ({ logPayoutEligibilityDecision }));

const stripeRefundsCreate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: vi.fn().mockReturnValue(true),
  getStripe: () => ({ refunds: { create: stripeRefundsCreate } }),
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
  orderRefundRequest: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  listing: {
    updateMany: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { createNotification } from "@/lib/notifications";
import {
  createBuyerRefundRequest,
  executeOrderRefund,
  sellerConfirmReturnReceived,
} from "@/services/order-refund-request";

const createNotificationMock = vi.mocked(createNotification);

/** A complete `OrderRefundRequest`-shaped row, for tests that need `serializeOrderRefundRequest`
 * (the real implementation, not mocked) to succeed on the value returned from `findUniqueOrThrow`
 * or `create`. */
function fullRefundRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "req_x",
    orderId: "ord_x",
    kind: "return",
    status: "pending_seller",
    reason: "test reason",
    photoUrls: [],
    sellerDenyReason: null,
    supportNote: null,
    returnTrackingNumber: null,
    returnCarrier: null,
    sellerDirect: false,
    escalatedAt: null,
    sellerRespondedAt: null,
    supportResolvedAt: null,
    returnReceivedAt: null,
    refundedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Order fixture eligible for a live-show "return" (delivered within the return window),
 * shaped to satisfy both `loadOrderForRefund`'s select and `executeOrderRefund`'s select at once
 * (the mock returns the same object regardless of which fields were actually requested). */
function returnEligibleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_return_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    listingId: "lst_1",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    status: "delivered",
    fulfillmentStatus: "delivered",
    shippedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    deliveryConfirmedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    stripePaymentIntentId: "pi_return_1",
    totalUsd: 100,
    itemPriceUsd: 90,
    shippingPriceUsd: 10,
    taxAmountCents: 0,
    payoutStatus: "pending",
    liveShippingSession: { liveShowId: "room_1" },
    listing: { title: "Return Card" },
    ...overrides,
  };
}

/** Order fixture eligible for a live-show "cancel" (not yet shipped). */
function cancelEligibleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_cancel_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    listingId: "lst_1",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    status: "paid",
    fulfillmentStatus: "pending",
    shippedAt: null,
    deliveryConfirmedAt: null,
    stripePaymentIntentId: "pi_cancel_1",
    totalUsd: 50,
    liveShippingSession: { liveShowId: "room_2" },
    listing: { title: "Cancel Card" },
    ...overrides,
  };
}

describe("executeOrderRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
    prismaMock.orderRefundRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.orderRefundRequest.count.mockResolvedValue(0);
    // Prior status this refund request was in before this attempt started — used by the
    // definite-Stripe-failure rollback logic. Individual tests override as needed.
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({ status: "pending_seller" });
  });

  it("issues a Stripe refund with reverse_transfer: true so the seller's transferred share is clawed back", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_123",
      itemPriceUsd: 100,
      shippingPriceUsd: 10,
      taxAmountCents: 800,
      listing: { title: "Test Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_123" });

    await executeOrderRefund("ord_1", "req_1");

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(1);
    const call = stripeRefundsCreate.mock.calls[0][0];
    expect(call.reverse_transfer).toBe(true);
    // Full refund = item + shipping + tax, in cents.
    expect(call.amount).toBe(100 * 100 + 10 * 100 + 800);
    expect(call.payment_intent).toBe("pi_123");
    // A retried request (network blip, duplicate admin click, etc.) must not double-refund the
    // buyer — Stripe dedupes by idempotency key, keyed to this specific refund request + amount.
    const opts = stripeRefundsCreate.mock.calls[0][1];
    expect(opts?.idempotencyKey).toBe(`order_refund_req_1_${100 * 100 + 10 * 100 + 800}c`);
  });

  it("blocks seller payout and records tax reversal atomically with the refund status", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_2",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_456",
      itemPriceUsd: 50,
      shippingPriceUsd: 0,
      taxAmountCents: 0,
      listing: { title: "Another Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_456" });

    await executeOrderRefund("ord_2", "req_2");

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_2" },
        data: expect.objectContaining({
          paymentStatus: "refunded",
          status: "cancelled",
          payoutStatus: "blocked",
          payoutBlockedReason: "refunded",
          taxRefundedCents: 0,
        }),
      }),
    );
  });

  it("is idempotent: does nothing further when the order is already refunded", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_3",
      paymentStatus: "refunded",
    });

    await executeOrderRefund("ord_3", "req_3");

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req_3", status: { not: "refunded" } } }),
    );
  });

  it("rejects escrow-paid orders (Stripe refund path does not support escrow)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_4",
      paymentStatus: "paid",
      paymentMethod: "escrow",
    });

    await expect(executeOrderRefund("ord_4", "req_4")).rejects.toMatchObject({ code: "ESCROW_NOT_SUPPORTED" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("rejects layaway-paid orders (a single-PI refund would only reverse the last installment, not the whole order)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_5",
      paymentStatus: "paid",
      paymentMethod: "layaway",
      stripePaymentIntentId: "pi_last_installment",
    });

    await expect(executeOrderRefund("ord_5", "req_5")).rejects.toMatchObject({ code: "LAYAWAY_NOT_SUPPORTED" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  // Regression (chaos audit): refund-during-payout race — an admin can release payout while a
  // buyer's refund request is in flight. `reverse_transfer` still claws the money back from
  // Stripe, but this must be flagged distinctly in the payout audit trail instead of looking like
  // a routine refund of an unpaid-out order.
  it("logs a payout audit entry when a refund executes after payout was already released", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_6",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_789",
      itemPriceUsd: 30,
      shippingPriceUsd: 0,
      taxAmountCents: 0,
      payoutStatus: "paid_out",
      listing: { title: "Already Paid Out Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_789" });

    await executeOrderRefund("ord_6", "req_6");

    expect(logPayoutEligibilityDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: "seller_1",
        orderId: "ord_6",
        previousStatus: "paid_out",
        newStatus: "blocked",
      }),
    );
  });

  it("does not log a payout audit entry for a normal refund where payout had not been released", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "ord_7",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      listingId: "lst_1",
      paymentStatus: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: "pi_101",
      itemPriceUsd: 30,
      shippingPriceUsd: 0,
      taxAmountCents: 0,
      payoutStatus: "pending",
      listing: { title: "Normal Card" },
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_101" });

    await executeOrderRefund("ord_7", "req_7");

    expect(logPayoutEligibilityDecision).not.toHaveBeenCalled();
  });

  // FIX 2 (atomicity with Stripe): the refund-request row must be durably marked as in-flight
  // BEFORE Stripe is called, using a stable-per-request idempotency key, so a later DB failure
  // can never leave "Stripe refunded the buyer" with zero local trace.
  it("records `refund_processing` on the request row before ever calling Stripe", async () => {
    const order = returnEligibleOrder({ id: "ord_proc_1" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    stripeRefundsCreate.mockResolvedValue({ id: "re_proc_1" });

    await executeOrderRefund("ord_proc_1", "req_proc_1");

    const preStripeCall = prismaMock.orderRefundRequest.updateMany.mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data.status === "refund_processing",
    );
    expect(preStripeCall).toBeTruthy();
    expect(preStripeCall?.[0]).toMatchObject({
      where: { id: "req_proc_1", status: { notIn: ["refund_processing", "refunded"] } },
    });
    // Order matters: the processing write must happen before Stripe is ever called.
    const preStripeCallOrder = prismaMock.orderRefundRequest.updateMany.mock.invocationCallOrder[0];
    const stripeCallOrder = stripeRefundsCreate.mock.invocationCallOrder[0];
    expect(preStripeCallOrder).toBeLessThan(stripeCallOrder);
  });

  // FIX 2 (critical failure-recovery path): Stripe succeeds, but the local finalize transaction
  // throws (e.g. a DB blip). The buyer's money has already moved — this must NOT be treated as a
  // generic failure. The row must stay `refund_processing` (never silently reset to a state that
  // looks like nothing happened, and never re-attempt Stripe), a distinct error must surface to
  // the caller, and the routine "refund completed" notifications must NOT fire from this path
  // (the Stripe<->DB reconciliation cron's `charge.refunded` replay is responsible for finishing
  // the job and sending those once it confirms the refund).
  it("surfaces a distinct pending-sync error (not a generic failure) when the DB finalize transaction fails after Stripe already succeeded", async () => {
    const order = returnEligibleOrder({ id: "ord_proc_2" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    stripeRefundsCreate.mockResolvedValue({ id: "re_proc_2" });
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db connection lost"));

    await expect(executeOrderRefund("ord_proc_2", "req_proc_2")).rejects.toMatchObject({
      code: "REFUND_ISSUED_PENDING_DB_SYNC",
    });

    // Stripe was actually called (money moved) exactly once — no retry-on-failure loop here.
    expect(stripeRefundsCreate).toHaveBeenCalledTimes(1);
    // The finalize write that would set `refunded` never committed (transaction rejected), and no
    // "refund completed" notification/side effects fired from this failed attempt.
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  // A retried call (row already `refund_processing` from a prior partial failure, or a duplicate
  // trigger) must reuse the exact same idempotency key rather than minting a new one — otherwise
  // Stripe would not dedupe the two attempts.
  it("reuses the same idempotency key across repeated calls for the same refund request (never double-refunds on retry)", async () => {
    const order = returnEligibleOrder({ id: "ord_proc_3" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    stripeRefundsCreate.mockResolvedValue({ id: "re_proc_3" });

    await executeOrderRefund("ord_proc_3", "req_proc_3");
    await executeOrderRefund("ord_proc_3", "req_proc_3");

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(2);
    const key1 = stripeRefundsCreate.mock.calls[0][1]?.idempotencyKey;
    const key2 = stripeRefundsCreate.mock.calls[1][1]?.idempotencyKey;
    expect(key1).toBe(key2);
  });

  // FIX 3 (code review of same-day two-phase refund fix): a definite Stripe failure (request
  // rejected outright — no money moved) must not leave the request permanently stuck in
  // `refund_processing`, since that status now blocks any new refund attempt on the order.
  it("rolls back refund_processing to the request's previous status when Stripe returns a definite (invalid-request) failure", async () => {
    const order = returnEligibleOrder({ id: "ord_definite_1" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({ status: "return_in_transit" });
    stripeRefundsCreate.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such charge",
      } as unknown as ConstructorParameters<typeof Stripe.errors.StripeInvalidRequestError>[0]),
    );

    await expect(executeOrderRefund("ord_definite_1", "req_definite_1")).rejects.toMatchObject({
      code: "STRIPE_REFUND_FAILED",
    });

    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req_definite_1", status: "refund_processing" },
      data: { status: "return_in_transit" },
    });
  });

  // The rollback must never fire for an ambiguous failure (connection error, timeout, rate limit)
  // — Stripe may have actually processed the refund despite the response never reaching us, so the
  // row must stay `refund_processing` pending reconciliation, exactly like the DB-finalize-failure
  // path above.
  it("does NOT roll back refund_processing when Stripe fails ambiguously (e.g. a connection error)", async () => {
    const order = returnEligibleOrder({ id: "ord_ambiguous_1" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({ status: "return_in_transit" });
    stripeRefundsCreate.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        message: "connection reset",
      } as unknown as ConstructorParameters<typeof Stripe.errors.StripeConnectionError>[0]),
    );

    await expect(executeOrderRefund("ord_ambiguous_1", "req_ambiguous_1")).rejects.toMatchObject({
      code: "STRIPE_REFUND_FAILED",
    });

    // Only the initial pre-Stripe write (flipping to `refund_processing`) happened — no rollback.
    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refund_processing" } }),
    );
  });

  // If this call is itself a retry of an earlier ambiguous failure (the row was ALREADY
  // `refund_processing` before this attempt started), a definite failure on the retry must not
  // roll back to `refund_processing` "as its previous state" in a way that masks the fact the
  // earlier attempt might have actually succeeded — no rollback should happen at all here.
  it("does NOT roll back when the row was already refund_processing before this attempt (retry of an earlier ambiguous failure)", async () => {
    const order = returnEligibleOrder({ id: "ord_already_processing" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({ status: "refund_processing" });
    stripeRefundsCreate.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such charge",
      } as unknown as ConstructorParameters<typeof Stripe.errors.StripeInvalidRequestError>[0]),
    );

    await expect(executeOrderRefund("ord_already_processing", "req_already_processing")).rejects.toMatchObject({
      code: "STRIPE_REFUND_FAILED",
    });

    expect(prismaMock.orderRefundRequest.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("sellerConfirmReturnReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
    prismaMock.orderRefundRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.orderRefundRequest.findUniqueOrThrow.mockResolvedValue(fullRefundRequestRow());
  });

  // FIX 1 (CRITICAL): a seller must never be able to trigger a refund before the buyer has taken
  // any action. `awaiting_return` means the seller approved the return but the buyer has not yet
  // submitted return tracking — the item may still be sitting with the buyer.
  it("rejects confirming receipt while the return is only `awaiting_return` (buyer has not shipped yet)", async () => {
    const order = returnEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue({
      id: "req_await_1",
      status: "awaiting_return",
      kind: "return",
    });

    await expect(
      sellerConfirmReturnReceived({ orderId: order.id, sellerId: order.sellerId }),
    ).rejects.toMatchObject({ code: "BUYER_HAS_NOT_SHIPPED_RETURN" });

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(prismaMock.orderRefundRequest.update).not.toHaveBeenCalled();
  });

  it("rejects when there is no return in progress at all", async () => {
    const order = returnEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);

    await expect(
      sellerConfirmReturnReceived({ orderId: order.id, sellerId: order.sellerId }),
    ).rejects.toMatchObject({ code: "NO_RETURN_IN_PROGRESS" });

    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("allows confirming receipt once the buyer has actually shipped the return (`return_in_transit`)", async () => {
    const order = returnEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue({
      id: "req_transit_1",
      status: "return_in_transit",
      kind: "return",
    });
    stripeRefundsCreate.mockResolvedValue({ id: "re_transit_1" });

    await sellerConfirmReturnReceived({ orderId: order.id, sellerId: order.sellerId });

    expect(prismaMock.orderRefundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req_transit_1" },
        data: { returnReceivedAt: expect.any(Date) },
      }),
    );
    expect(stripeRefundsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("createBuyerRefundRequest (FIX 3: duplicate active request race, FIX 5: re-file-after-denial limit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
    prismaMock.orderRefundRequest.count.mockResolvedValue(0);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null); // "getLatestRefundRequest" + in-tx active check both default to none
    prismaMock.orderRefundRequest.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(fullRefundRequestRow(args.data)),
    );
  });

  it("creates the row inside a Serializable transaction (closing the read-check-then-write race)", async () => {
    const order = cancelEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);

    await createBuyerRefundRequest({
      orderId: order.id,
      buyerId: order.buyerId,
      kind: "cancel",
      reason: "changed my mind",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("blocks a concurrent duplicate request when the in-transaction re-check finds an active row (the race the app-level pre-check alone would miss)", async () => {
    const order = cancelEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    // Simulates: another request's transaction committed its `create` between this caller's
    // initial eligibility check and this transaction's own active-request read.
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue({ id: "req_other", status: "pending_seller" });

    await expect(
      createBuyerRefundRequest({ orderId: order.id, buyerId: order.buyerId, kind: "cancel", reason: "dup attempt" }),
    ).rejects.toMatchObject({ code: "REQUEST_ALREADY_OPEN" });

    expect(prismaMock.orderRefundRequest.create).not.toHaveBeenCalled();
  });

  it("translates a DB-level unique constraint violation (partial unique index) into REQUEST_ALREADY_OPEN", async () => {
    const order = cancelEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);
    prismaMock.orderRefundRequest.create.mockRejectedValue({ code: "P2002" });

    await expect(
      createBuyerRefundRequest({ orderId: order.id, buyerId: order.buyerId, kind: "cancel", reason: "dup attempt" }),
    ).rejects.toMatchObject({ code: "REQUEST_ALREADY_OPEN" });
  });

  it("translates a Serializable-transaction write conflict into REQUEST_ALREADY_OPEN", async () => {
    const order = cancelEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);
    prismaMock.orderRefundRequest.create.mockRejectedValue({ code: "P2034" });

    await expect(
      createBuyerRefundRequest({ orderId: order.id, buyerId: order.buyerId, kind: "cancel", reason: "dup attempt" }),
    ).rejects.toMatchObject({ code: "REQUEST_ALREADY_OPEN" });
  });

  // FIX 5 (policy choice — flagged for owner review): a buyer may re-file exactly once after a
  // support denial before being told to contact support directly.
  it("allows a buyer to re-file once after a single prior support denial (legitimate appeal path preserved)", async () => {
    const order = returnEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockImplementation((args: { where?: { status?: unknown } }) => {
      // First call inside `createBuyerRefundRequest` is `getLatestRefundRequest` (no status
      // filter); the second is the in-transaction active-request check.
      if (!args?.where?.status) {
        return Promise.resolve({ id: "req_denied_1", status: "support_denied" });
      }
      return Promise.resolve(null);
    });
    prismaMock.orderRefundRequest.count.mockResolvedValue(1); // exactly one prior denial

    const result = await createBuyerRefundRequest({
      orderId: order.id,
      buyerId: order.buyerId,
      kind: "return",
      reason: "still defective, appealing",
      photoUrls: ["https://example.com/a.jpg"],
    });

    expect(result.id).toBeTruthy();
    expect(prismaMock.orderRefundRequest.create).toHaveBeenCalledTimes(1);
  });

  it("blocks re-filing a second time after the one-time appeal was also denied", async () => {
    const order = returnEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockImplementation((args: { where?: { status?: unknown } }) => {
      if (!args?.where?.status) {
        return Promise.resolve({ id: "req_denied_2", status: "support_denied" });
      }
      return Promise.resolve(null);
    });
    prismaMock.orderRefundRequest.count.mockResolvedValue(2); // original denial + one re-file, also denied

    await expect(
      createBuyerRefundRequest({
        orderId: order.id,
        buyerId: order.buyerId,
        kind: "return",
        reason: "trying again",
        photoUrls: ["https://example.com/a.jpg"],
      }),
    ).rejects.toMatchObject({ code: "REFILE_LIMIT_REACHED" });

    expect(prismaMock.orderRefundRequest.create).not.toHaveBeenCalled();
  });

  it("does not apply the re-file limit when the latest request is not support_denied (normal first-time request)", async () => {
    const order = cancelEligibleOrder();
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findFirst.mockResolvedValue(null);

    await createBuyerRefundRequest({
      orderId: order.id,
      buyerId: order.buyerId,
      kind: "cancel",
      reason: "first time request",
    });

    expect(prismaMock.orderRefundRequest.count).not.toHaveBeenCalled();
    expect(prismaMock.orderRefundRequest.create).toHaveBeenCalledTimes(1);
  });
});

// FIX 3(b): a request stuck in `refund_processing` previously had no self-service or admin retry
// path other than a raw DB fix. `adminRetryStuckRefund` lets an admin safely re-attempt it (Stripe
// dedupes on the stable per-request idempotency key, so re-running `executeOrderRefund` can never
// double-refund), gated behind a minimum stuck duration so it can't race a genuinely in-flight send.
describe("adminRetryStuckRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
    prismaMock.orderRefundRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rejects when the request is not in refund_processing", async () => {
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({
      id: "req_1",
      orderId: "ord_1",
      status: "pending_seller",
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    const { adminRetryStuckRefund } = await import("@/services/order-refund-request");
    await expect(
      adminRetryStuckRefund({ requestId: "req_1", adminUserId: "admin_1" }),
    ).rejects.toMatchObject({ code: "NOT_STUCK" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("rejects when the request has only just entered refund_processing (not stuck long enough yet)", async () => {
    prismaMock.orderRefundRequest.findUnique.mockResolvedValue({
      id: "req_2",
      orderId: "ord_2",
      status: "refund_processing",
      updatedAt: new Date(), // just now
    });

    const { adminRetryStuckRefund } = await import("@/services/order-refund-request");
    await expect(
      adminRetryStuckRefund({ requestId: "req_2", adminUserId: "admin_1" }),
    ).rejects.toMatchObject({ code: "NOT_STUCK_YET" });
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("re-attempts the refund when genuinely stuck in refund_processing past the threshold", async () => {
    const order = returnEligibleOrder({ id: "ord_3", paymentStatus: "paid" });
    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.orderRefundRequest.findUnique
      .mockResolvedValueOnce({
        id: "req_3",
        orderId: "ord_3",
        status: "refund_processing",
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // stuck 10 minutes
      })
      // Second call is `executeOrderRefund`'s own internal read of the prior status.
      .mockResolvedValueOnce({ status: "refund_processing" });
    prismaMock.orderRefundRequest.findUniqueOrThrow.mockResolvedValue(fullRefundRequestRow({ status: "refunded" }));
    stripeRefundsCreate.mockResolvedValue({ id: "re_retry_1" });

    const { adminRetryStuckRefund } = await import("@/services/order-refund-request");
    const result = await adminRetryStuckRefund({ requestId: "req_3", adminUserId: "admin_1" });

    expect(stripeRefundsCreate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("refunded");
  });
});
