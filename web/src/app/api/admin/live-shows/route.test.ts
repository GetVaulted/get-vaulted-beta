import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (MEDIUM, code review of same-day `finalSalesGmvUsd` rollout): the admin "ended shows"
// list was still returning the raw, reset-to-0 `completedSalesGmvUsd` for ended shows instead of
// the true final total (`finalSalesGmvUsd`, via `liveShowGmvForFeeTierReconstruction`).

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  liveRoomFindMany: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: hoisted.requireAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { liveRoom: { findMany: hoisted.liveRoomFindMany } } }));

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "room_1",
    title: "Vintage break",
    status: "ended",
    category: "sports",
    roomType: "break",
    seller: { id: "seller_1", username: "seller1", email: "seller1@test.internal" },
    viewerCount: 0,
    streamHealth: "unknown",
    streamProvider: "ivs",
    streamMode: "solo",
    ivsChannelArn: null,
    ivsStageArn: null,
    ivsCompositionArn: null,
    lastIvsStatusSyncAt: null,
    lastIvsError: null,
    streamStartedAt: null,
    streamEndedAt: null,
    scheduledStartAt: null,
    startedAt: null,
    endedAt: new Date("2026-07-05T12:00:00.000Z"),
    completedSalesGmvUsd: 0,
    finalSalesGmvUsd: 4500,
    auctionEventSeq: 0,
    items: [],
    _count: { roomBids: 0, reports: 0 },
    ...overrides,
  };
}

describe("GET /api/admin/live-shows — ended-show GMV source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue({ ok: true, userId: "admin_1" });
  });

  it("reports the persisted final GMV total for an ended show instead of the reset-to-0 counter", async () => {
    hoisted.liveRoomFindMany.mockResolvedValue([baseRow()]);

    const { GET } = await import("@/app/api/admin/live-shows/route");
    const res = await GET(new Request("https://example.com/api/admin/live-shows"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.shows).toHaveLength(1);
    expect(json.shows[0].completedSalesGmvUsd).toBe(4500);
  });

  it("still reports the live, in-progress counter for a show that is still live", async () => {
    hoisted.liveRoomFindMany.mockResolvedValue([
      baseRow({ status: "live", completedSalesGmvUsd: 900, finalSalesGmvUsd: null }),
    ]);

    const { GET } = await import("@/app/api/admin/live-shows/route");
    const res = await GET(new Request("https://example.com/api/admin/live-shows"));
    const json = await res.json();

    expect(json.shows[0].completedSalesGmvUsd).toBe(900);
  });
});
