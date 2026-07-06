import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  expireStaleLiveAuctionInventoryHolds: vi.fn().mockResolvedValue(0),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/lib/live-auction-inventory-hold", () => ({
  expireStaleLiveAuctionInventoryHolds: hoisted.expireStaleLiveAuctionInventoryHolds,
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.reportCronAnomaly,
}));

import { POST } from "@/app/api/cron/inventory-holds/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/inventory-holds", { method: "POST", headers });
}

describe("POST /api/cron/inventory-holds auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.expireStaleLiveAuctionInventoryHolds).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer wrong"));

    expect(res.status).toBe(401);
    expect(hoisted.expireStaleLiveAuctionInventoryHolds).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";
    hoisted.expireStaleLiveAuctionInventoryHolds.mockResolvedValue(4);

    const res = await POST(buildRequest("Bearer s3cr3t"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, expired: 4 });
  });

  it("runs outside production even when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(hoisted.expireStaleLiveAuctionInventoryHolds).toHaveBeenCalled();
  });

  it("reports a cron anomaly and returns 500 when the sweep throws", async () => {
    vi.stubEnv("NODE_ENV", "test");
    hoisted.expireStaleLiveAuctionInventoryHolds.mockRejectedValue(new Error("db down"));

    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith("inventory-holds", "db down");
  });
});
