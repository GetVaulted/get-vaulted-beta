import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  reportStalledAuctionLotsToAdmin: vi.fn().mockResolvedValue({ checked: 0, newlyAlerted: 0 }),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/lib/live-auction-stalled-lots", () => ({
  reportStalledAuctionLotsToAdmin: hoisted.reportStalledAuctionLotsToAdmin,
}));
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportCronAnomaly: hoisted.reportCronAnomaly }));

import { POST } from "@/app/api/cron/live-auction-integrity/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/live-auction-integrity", { method: "POST", headers });
}

describe("POST /api/cron/live-auction-integrity auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    hoisted.reportStalledAuctionLotsToAdmin.mockResolvedValue({ checked: 0, newlyAlerted: 0 });
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect(hoisted.reportStalledAuctionLotsToAdmin).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(buildRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("runs when authorized and returns the sweep result", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";
    hoisted.reportStalledAuctionLotsToAdmin.mockResolvedValue({ checked: 2, newlyAlerted: 1 });

    const res = await POST(buildRequest("Bearer s3cr3t"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 2, newlyAlerted: 1 });
  });

  it("reports a cron anomaly and returns 500 when the sweep throws", async () => {
    vi.stubEnv("NODE_ENV", "test");
    hoisted.reportStalledAuctionLotsToAdmin.mockRejectedValue(new Error("db down"));

    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith("live-auction-stall", "db down");
  });
});
