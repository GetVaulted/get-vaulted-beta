import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  finalizeOverdueLiveAuctionLotsAcrossLiveRooms: vi.fn().mockResolvedValue({
    roomsChecked: 0,
    roomsTouched: 0,
    finalized: 0,
    results: [],
  }),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/lib/live-auction-finalize", () => ({
  finalizeOverdueLiveAuctionLotsAcrossLiveRooms: hoisted.finalizeOverdueLiveAuctionLotsAcrossLiveRooms,
}));
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportCronAnomaly: hoisted.reportCronAnomaly }));

import { POST } from "@/app/api/cron/live-auction-finalize/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/live-auction-finalize", { method: "POST", headers });
}

describe("POST /api/cron/live-auction-finalize auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    hoisted.finalizeOverdueLiveAuctionLotsAcrossLiveRooms.mockResolvedValue({
      roomsChecked: 0,
      roomsTouched: 0,
      finalized: 0,
      results: [],
    });
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect(hoisted.finalizeOverdueLiveAuctionLotsAcrossLiveRooms).not.toHaveBeenCalled();
  });

  it("rejects unauthorized when secret mismatches", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(buildRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(hoisted.finalizeOverdueLiveAuctionLotsAcrossLiveRooms).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(buildRequest("Bearer s3cr3t"));
    expect(res.status).toBe(200);
    expect(hoisted.finalizeOverdueLiveAuctionLotsAcrossLiveRooms).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toMatchObject({ ok: true, finalized: 0 });
  });
});
