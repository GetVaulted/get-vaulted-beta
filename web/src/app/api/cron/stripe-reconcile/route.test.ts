import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  reconcileStripeWithDatabase: vi.fn(),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/services/stripe-reconciliation", () => ({
  reconcileStripeWithDatabase: hoisted.reconcileStripeWithDatabase,
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.reportCronAnomaly,
}));

import { POST } from "@/app/api/cron/stripe-reconcile/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/stripe-reconcile", { method: "POST", headers });
}

const emptyReport = {
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  lookbackHours: 24,
  configured: true,
  scanned: { checkoutSessions: 0, paymentIntents: 0, disputes: 0, refunds: 0, stalePendingOrdersChecked: 0 },
  healed: [],
  orphans: [],
  errors: [],
};

describe("POST /api/cron/stripe-reconcile auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    hoisted.reconcileStripeWithDatabase.mockResolvedValue(emptyReport);
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.reconcileStripeWithDatabase).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer wrong"));

    expect(res.status).toBe(401);
    expect(hoisted.reconcileStripeWithDatabase).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET and returns the report", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer s3cr3t"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, report: emptyReport });
  });

  it("reports a cron anomaly when the report contains errors, but still returns 200", async () => {
    vi.stubEnv("NODE_ENV", "test");
    hoisted.reconcileStripeWithDatabase.mockResolvedValue({
      ...emptyReport,
      errors: [{ category: "checkout_session", stripeId: "cs_1", kind: "buy_now", orderId: "order_1", issue: "boom" }],
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith("stripe-reconcile", "1 error(s) during reconciliation run");
  });

  it("reports a cron anomaly and returns 500 when the reconcile call itself throws", async () => {
    vi.stubEnv("NODE_ENV", "test");
    hoisted.reconcileStripeWithDatabase.mockRejectedValue(new Error("stripe down"));

    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith("stripe-reconcile", "stripe down");
  });
});
