import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const hoisted = vi.hoisted(() => ({
  requireLiveRoomHostUser: vi.fn(),
  fetchLiveShowSellerSummary: vi.fn(),
}));

vi.mock("@/lib/resolve-live-room-host-user", () => ({
  requireLiveRoomHostUser: hoisted.requireLiveRoomHostUser,
}));

vi.mock("@/lib/live-show-seller-summary", () => ({
  fetchLiveShowSellerSummary: hoisted.fetchLiveShowSellerSummary,
}));

vi.mock("@/lib/live-loader-debug", () => ({
  safeDecodeRouteSegment: (s: string) => s,
}));

vi.mock("@/lib/prisma-api-error-response", () => ({
  apiErrorResponseFromUnknown: () => NextResponse.json({ error: "fail" }, { status: 500 }),
}));

import { GET } from "./route";

describe("GET /api/live-rooms/[id]/seller-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-host sellers", async () => {
    hoisted.requireLiveRoomHostUser.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET(new Request("http://localhost/api/live-rooms/room_a/seller-summary"), {
      params: Promise.resolve({ id: "room_a" }),
    });
    expect(res.status).toBe(403);
    expect(hoisted.fetchLiveShowSellerSummary).not.toHaveBeenCalled();
  });

  it("returns summary for host", async () => {
    hoisted.requireLiveRoomHostUser.mockResolvedValue({ userId: "seller_1", isAdmin: false });
    hoisted.fetchLiveShowSellerSummary.mockResolvedValue({
      showId: "room_a",
      status: "live",
      currency: "usd",
      grossShowSalesCents: 10_000,
      refundedShowSalesCents: 0,
      netShowSalesCents: 10_000,
      paidOrderCount: 1,
      feeTierGmvCents: 10_000,
      currentFeeRateBps: 800,
      currentFeeRatePercent: 8,
      nextTierRateBps: 725,
      nextTierThresholdCents: 100_000,
      amountUntilNextTierCents: 90_000,
      tierProgressPercent: 10,
      feeTier: { completedGmvUsd: 100 },
      calculatedAt: "2026-07-19T12:00:00.000Z",
    });
    const res = await GET(new Request("http://localhost/api/live-rooms/room_a/seller-summary"), {
      params: Promise.resolve({ id: "room_a" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grossShowSalesCents).toBe(10_000);
    expect(body.paidOrderCount).toBe(1);
    expect(hoisted.fetchLiveShowSellerSummary).toHaveBeenCalledWith("room_a");
  });
});
