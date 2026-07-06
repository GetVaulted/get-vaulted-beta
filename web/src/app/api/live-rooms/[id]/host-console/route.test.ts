import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (MEDIUM, code review of same-day `finalSalesGmvUsd` rollout): the host console's
// `feeTier` snapshot was still reading `completedSalesGmvUsd` directly, which is reset to 0 the
// moment a show ends — showing the host a $0/tier-0 GMV on their own just-ended show instead of the
// true final total (`finalSalesGmvUsd`, via `liveShowGmvForFeeTierReconstruction`).

const hoisted = vi.hoisted(() => ({
  requireLiveRoomHostUser: vi.fn(),
  buildLiveShowFeeTierSnapshot: vi.fn().mockReturnValue({ tier: "mocked" }),
  liveRoomFindUnique: vi.fn(),
}));

vi.mock("@/lib/resolve-live-room-host-user", () => ({
  requireLiveRoomHostUser: hoisted.requireLiveRoomHostUser,
}));

vi.mock("@/lib/platform-fee-policy", () => ({
  buildLiveShowFeeTierSnapshot: hoisted.buildLiveShowFeeTierSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: { findUnique: hoisted.liveRoomFindUnique },
    breakHit: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/live-giveaway", () => ({ listLiveGiveawaysForRoom: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/live-room-host-auth", () => ({ parseTeamLabelsJson: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/live-loader-debug", () => ({
  logLiveLoaderDebug: vi.fn(),
  safeDecodeRouteSegment: (s: string) => s,
}));
vi.mock("@/lib/live-room-recent-sales", () => ({ fetchHostRecentSales: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/live-show-fee-settings", () => ({ ensureLiveShowFeeCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/live-room-high-bidder-enrich", () => ({
  attachHighBidderUsernames: vi.fn().mockImplementation(async (items: unknown[]) => items),
}));
vi.mock("@/lib/live-room-payment-failure", () => ({
  listUnresolvedPaymentFailuresForRoom: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/live-room-serialize", () => ({
  serializeLiveRoomItem: vi.fn().mockImplementation((it: { id: string }) => it),
  serializeLiveRoomMessage: vi.fn().mockImplementation((m: unknown) => m),
}));
vi.mock("@/lib/live-item-variant-include", () => ({ liveRoomItemsHostConsoleInclude: {} }));
vi.mock("@/lib/live-item-variant-host-console-enrich", () => ({
  attachHostConsoleVariantPurchases: vi.fn().mockImplementation(async (items: unknown[]) => items),
}));
vi.mock("@/lib/live-variant-random-claims", () => ({
  enrichLiveRoomItemsRandomClaims: vi.fn().mockImplementation(async (items: unknown[]) => items),
}));
vi.mock("@/lib/prisma-api-error-response", () => ({
  apiErrorResponseFromUnknown: vi.fn().mockReturnValue(new Response("error", { status: 500 })),
}));
vi.mock("@/lib/log-room-state-snapshot", () => ({ logSellerRoomStateSnapshot: vi.fn() }));
vi.mock("@/lib/live-room-break-public", () => ({ computeBreakBuyerPhase: vi.fn().mockReturnValue(null) }));

function baseRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room_1",
    sellerId: "seller_1",
    status: "ended",
    roomType: "auction",
    completedSalesGmvUsd: 0,
    finalSalesGmvUsd: 3200,
    lockPurchases: false,
    breakPaused: false,
    items: [],
    breakSpots: [],
    messages: [],
    ...overrides,
  };
}

describe("GET /api/live-rooms/[id]/host-console — feeTier GMV source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireLiveRoomHostUser.mockResolvedValue({ userId: "seller_1", isAdmin: false, room: {} });
  });

  it("uses the final (never-reset) GMV snapshot for the fee tier once the show has ended, not the reset-to-0 counter", async () => {
    hoisted.liveRoomFindUnique.mockResolvedValue(baseRoom());

    const { GET } = await import("@/app/api/live-rooms/[id]/host-console/route");
    const res = await GET(new Request("https://example.com/api/live-rooms/room_1/host-console?lite=1"), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).toBe(200);
    // Must be called with the persisted final total (3200), never the reset live counter (0).
    expect(hoisted.buildLiveShowFeeTierSnapshot).toHaveBeenCalledWith(3200);
  });

  it("still uses the live, in-progress counter while the show is ongoing", async () => {
    hoisted.liveRoomFindUnique.mockResolvedValue(
      baseRoom({ status: "live", completedSalesGmvUsd: 750, finalSalesGmvUsd: null }),
    );

    const { GET } = await import("@/app/api/live-rooms/[id]/host-console/route");
    const res = await GET(new Request("https://example.com/api/live-rooms/room_1/host-console?lite=1"), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).toBe(200);
    expect(hoisted.buildLiveShowFeeTierSnapshot).toHaveBeenCalledWith(750);
  });
});
