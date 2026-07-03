import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const constructStripeWebhookEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({ constructStripeWebhookEvent }));

const processStripeWebhookEvent = vi.hoisted(() => vi.fn());
vi.mock("@/services/payments", () => ({ processStripeWebhookEvent }));

const webhookLog = vi.hoisted(() => ({
  createWebhookLogEntry: vi.fn().mockResolvedValue({ id: "log_1" }),
  markWebhookLogFailure: vi.fn().mockResolvedValue(undefined),
  markWebhookLogSkippedDuplicate: vi.fn().mockResolvedValue(undefined),
  markWebhookLogSuccess: vi.fn().mockResolvedValue(undefined),
  updateWebhookLogEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/webhook-log", () => webhookLog);

const prismaMock = vi.hoisted(() => ({
  processedStripeEvent: {
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/stripe/webhook/route";

function fakeEvent(id: string): Stripe.Event {
  return { id, type: "account.updated" } as unknown as Stripe.Event;
}

function fakeRequest(): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

describe("Stripe webhook idempotency claim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the event id before processing and marks success", async () => {
    constructStripeWebhookEvent.mockReturnValue(fakeEvent("evt_1"));
    prismaMock.processedStripeEvent.create.mockResolvedValue({ id: "evt_1" });
    processStripeWebhookEvent.mockResolvedValue(undefined);

    const res = await POST(fakeRequest());

    expect(prismaMock.processedStripeEvent.create).toHaveBeenCalledWith({ data: { id: "evt_1" } });
    const claimOrder = prismaMock.processedStripeEvent.create.mock.invocationCallOrder[0];
    const processOrder = processStripeWebhookEvent.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(processOrder);
    expect(webhookLog.markWebhookLogSuccess).toHaveBeenCalledWith("log_1");
    expect(res.status).toBe(200);
  });

  it("treats a unique-constraint violation on claim as a duplicate and skips processing", async () => {
    constructStripeWebhookEvent.mockReturnValue(fakeEvent("evt_2"));
    prismaMock.processedStripeEvent.create.mockRejectedValue({ code: "P2002" });

    const res = await POST(fakeRequest());

    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
    expect(webhookLog.markWebhookLogSkippedDuplicate).toHaveBeenCalledWith("log_1");
    const body = await res.json();
    expect(body).toEqual({ received: true, duplicate: true });
  });

  it("releases the claim on processing failure so Stripe's retry can reprocess", async () => {
    constructStripeWebhookEvent.mockReturnValue(fakeEvent("evt_3"));
    prismaMock.processedStripeEvent.create.mockResolvedValue({ id: "evt_3" });
    processStripeWebhookEvent.mockRejectedValue(new Error("handler exploded"));

    const res = await POST(fakeRequest());

    expect(prismaMock.processedStripeEvent.deleteMany).toHaveBeenCalledWith({ where: { id: "evt_3" } });
    expect(webhookLog.markWebhookLogFailure).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it("rethrows non-duplicate DB errors from the claim instead of silently proceeding", async () => {
    constructStripeWebhookEvent.mockReturnValue(fakeEvent("evt_4"));
    prismaMock.processedStripeEvent.create.mockRejectedValue(new Error("db down"));

    await expect(POST(fakeRequest())).rejects.toThrow("db down");
    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
  });
});
