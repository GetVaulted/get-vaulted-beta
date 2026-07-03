import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  createWebhookLogEntry: vi.fn().mockResolvedValue({ id: "log_1" }),
  markWebhookLogFailure: vi.fn().mockResolvedValue(undefined),
  markWebhookLogSuccess: vi.fn().mockResolvedValue(undefined),
  updateWebhookLogEntry: vi.fn().mockResolvedValue(undefined),
  verifyShippoWebhookSignature: vi.fn(),
  orderFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/webhook-log", () => ({
  createWebhookLogEntry: hoisted.createWebhookLogEntry,
  markWebhookLogFailure: hoisted.markWebhookLogFailure,
  markWebhookLogSuccess: hoisted.markWebhookLogSuccess,
  updateWebhookLogEntry: hoisted.updateWebhookLogEntry,
}));

vi.mock("@/lib/shippo", () => ({
  verifyShippoWebhookSignature: hoisted.verifyShippoWebhookSignature,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findMany: hoisted.orderFindMany, update: vi.fn() } },
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/marketplace/ecosystem-sync", () => ({ emitOrderLifecycleSync: vi.fn() }));
vi.mock("@/lib/seller-commerce-event", () => ({
  SELLER_COMMERCE_KIND: { fulfillmentDelivered: "fulfillment_delivered", fulfillmentInTransit: "fulfillment_in_transit", fulfillmentException: "fulfillment_exception" },
  logSellerCommerceEvent: vi.fn(),
}));
vi.mock("@/services/shipping", () => ({
  buildOrderUpdateForShippoFulfillment: vi.fn().mockReturnValue({}),
  mapShippoTrackingToFulfillment: vi.fn().mockReturnValue(null),
}));
vi.mock("@/services/payout/process-delivery-payout", () => ({ processDeliveryPayoutEvaluation: vi.fn() }));
vi.mock("@/services/payout/process-payout-tier-events", () => ({ processCarrierAcceptancePayoutEvaluation: vi.fn() }));

import { POST } from "@/app/api/shippo/webhook/route";

function buildRequest(body: unknown, signature?: string) {
  const headers = new Headers();
  if (signature) headers.set("Shippo-Signature", signature);
  return new Request("http://localhost/api/shippo/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/shippo/webhook signature gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SHIPPO_WEBHOOK_SECRET;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.SHIPPO_WEBHOOK_SECRET;
  });

  it("rejects with 503 in production when SHIPPO_WEBHOOK_SECRET is unset (regression: must fail closed, not accept unverified payloads)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest({ event: "track_updated" }));

    expect(res.status).toBe(503);
    expect(hoisted.verifyShippoWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects with 401 when a secret is configured but the signature is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SHIPPO_WEBHOOK_SECRET = "whsec_test";
    hoisted.verifyShippoWebhookSignature.mockReturnValue(false);

    const res = await POST(buildRequest({ event: "track_updated" }, "bad-sig"));

    expect(res.status).toBe(401);
  });

  it("processes the request outside production even when SHIPPO_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const res = await POST(buildRequest({ event: "track_updated" }));

    expect(res.status).toBe(200);
    expect(hoisted.verifyShippoWebhookSignature).not.toHaveBeenCalled();
  });
});
