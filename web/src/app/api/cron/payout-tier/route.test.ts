import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  recalculateAllSellerPayoutTiers: vi.fn().mockResolvedValue({ updated: 0 }),
}));

vi.mock("@/services/payout/recalculate-seller-payout-tier", () => ({
  recalculateAllSellerPayoutTiers: hoisted.recalculateAllSellerPayoutTiers,
}));

import { POST } from "@/app/api/cron/payout-tier/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/payout-tier", { method: "POST", headers });
}

describe("POST /api/cron/payout-tier auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset (regression: must fail closed, not run unauthenticated)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.recalculateAllSellerPayoutTiers).not.toHaveBeenCalled();
  });

  it("rejects with 401 when a secret is configured but the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer wrong"));

    expect(res.status).toBe(401);
    expect(hoisted.recalculateAllSellerPayoutTiers).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer s3cr3t"));

    expect(res.status).toBe(200);
    expect(hoisted.recalculateAllSellerPayoutTiers).toHaveBeenCalled();
  });

  it("runs outside production even when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(hoisted.recalculateAllSellerPayoutTiers).toHaveBeenCalled();
  });
});
