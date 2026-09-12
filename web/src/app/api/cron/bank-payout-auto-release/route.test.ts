import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

type ReadyOrderStub = { orderId: string; sellerId: string; estimatedNetUsd: number };

const hoisted = vi.hoisted(() => ({
  listOrdersReadyForAdminBankPayout: vi.fn<() => Promise<ReadyOrderStub[]>>().mockResolvedValue([]),
  releaseSellerReadyBankPayouts: vi.fn(),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/lib/admin/orders-ready-for-bank-payout", () => ({
  listOrdersReadyForAdminBankPayout: hoisted.listOrdersReadyForAdminBankPayout,
}));

vi.mock("@/lib/admin/release-seller-bank-payouts", () => ({
  releaseSellerReadyBankPayouts: hoisted.releaseSellerReadyBankPayouts,
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.reportCronAnomaly,
}));

import { POST } from "@/app/api/cron/bank-payout-auto-release/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/bank-payout-auto-release", { method: "POST", headers });
}

function readyOrder(sellerId: string, orderId = `order-${sellerId}`) {
  return { orderId, sellerId, estimatedNetUsd: 10 };
}

describe("POST /api/cron/bank-payout-auto-release auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listOrdersReadyForAdminBankPayout.mockResolvedValue([]);
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset (must fail closed)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.listOrdersReadyForAdminBankPayout).not.toHaveBeenCalled();
  });

  it("rejects with 401 when a secret is configured but the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer wrong"));

    expect(res.status).toBe(401);
    expect(hoisted.listOrdersReadyForAdminBankPayout).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer s3cr3t"));

    expect(res.status).toBe(200);
    expect(hoisted.listOrdersReadyForAdminBankPayout).toHaveBeenCalled();
  });

  it("runs outside production even when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(hoisted.listOrdersReadyForAdminBankPayout).toHaveBeenCalled();
  });
});

describe("POST /api/cron/bank-payout-auto-release release behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing and reports no anomaly when there are no ready orders", async () => {
    hoisted.listOrdersReadyForAdminBankPayout.mockResolvedValue([]);

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, sellersEvaluated: 0, pushed: 0, skipped: 0, failed: 0 });
    expect(hoisted.releaseSellerReadyBankPayouts).not.toHaveBeenCalled();
    expect(hoisted.reportCronAnomaly).not.toHaveBeenCalled();
  });

  it("releases each distinct seller with ready orders exactly once and aggregates totals", async () => {
    hoisted.listOrdersReadyForAdminBankPayout.mockResolvedValue([
      readyOrder("seller-a", "order-1"),
      readyOrder("seller-a", "order-2"),
      readyOrder("seller-b", "order-3"),
    ]);
    hoisted.releaseSellerReadyBankPayouts.mockImplementation(async ({ sellerId }: { sellerId: string }) => ({
      ok: true,
      pushed: sellerId === "seller-a" ? 2 : 1,
      skipped: 0,
      failed: 0,
      totalPaidUsd: sellerId === "seller-a" ? 20 : 10,
      remainingAvailableUsd: 0,
      results: [],
    }));

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(hoisted.releaseSellerReadyBankPayouts).toHaveBeenCalledTimes(2);
    expect(hoisted.releaseSellerReadyBankPayouts).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "seller-a", reason: expect.any(String) }),
    );
    expect(hoisted.releaseSellerReadyBankPayouts).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "seller-b", reason: expect.any(String) }),
    );
    expect(body).toMatchObject({ ok: true, sellersEvaluated: 2, pushed: 3, totalPaidUsd: 30 });
    expect(hoisted.reportCronAnomaly).not.toHaveBeenCalled();
  });

  it("reports an anomaly when a seller's release throws, but still processes the others", async () => {
    hoisted.listOrdersReadyForAdminBankPayout.mockResolvedValue([
      readyOrder("seller-a"),
      readyOrder("seller-b"),
    ]);
    hoisted.releaseSellerReadyBankPayouts.mockImplementation(async ({ sellerId }: { sellerId: string }) => {
      if (sellerId === "seller-a") throw new Error("stripe down");
      return { ok: true, pushed: 1, skipped: 0, failed: 0, totalPaidUsd: 10, remainingAvailableUsd: 0, results: [] };
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, sellersEvaluated: 2, sellersThrew: 1, pushed: 1 });
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith(
      "bank-payout-auto-release",
      expect.stringContaining("1 of 2"),
    );
  });

  it("reports an anomaly when orders fail to release within an otherwise successful run", async () => {
    hoisted.listOrdersReadyForAdminBankPayout.mockResolvedValue([readyOrder("seller-a")]);
    hoisted.releaseSellerReadyBankPayouts.mockResolvedValue({
      ok: true,
      pushed: 0,
      skipped: 0,
      failed: 1,
      totalPaidUsd: 0,
      remainingAvailableUsd: 0,
      results: [{ orderId: "order-seller-a", ok: false, reason: "insufficient_available_balance" }],
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, failed: 1 });
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith(
      "bank-payout-auto-release",
      expect.stringContaining("1 order(s) failed"),
    );
  });
});
