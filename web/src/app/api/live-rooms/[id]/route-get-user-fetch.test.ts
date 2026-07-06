import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: GET /api/live-rooms/[id] previously fetched the viewer's `User` row twice (once
// for `role`, once for `email`) and ran the seller/viewer lookups sequentially even though
// they're independent (performance audit 2026-07).

const userFindUnique = vi.fn();
const liveRoomFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    liveRoom: { findUnique: (...a: unknown[]) => liveRoomFindUnique(...a) },
  },
}));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({
  resolveLiveRoomsUserId: vi.fn(),
  resolveOptionalLiveRoomsUserId: vi.fn().mockResolvedValue("buyer_1"),
}));

vi.mock("@/lib/live-room-serialize", () => ({
  buildLiveRoomDetail: vi.fn().mockReturnValue({
    id: "room_1",
    items: [],
    activeItem: null,
    status: "live",
  }),
}));

vi.mock("@/lib/live-room-high-bidder-enrich", () => ({
  attachHighBidderUsernames: vi.fn().mockImplementation(async (items: unknown[]) => items),
}));

vi.mock("@/lib/live-variant-random-claims", () => ({
  enrichLiveRoomDetailRandomClaims: vi.fn().mockImplementation(async (d: unknown) => d),
}));

vi.mock("@/lib/live-giveaway", () => ({
  listViewerGiveawaysForRoom: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/buyer-live-wallet-readiness", () => ({
  getBuyerLiveWalletReadiness: vi.fn().mockResolvedValue({ paymentReady: true, shippingReady: true }),
}));

vi.mock("@/lib/live-payment-pipeline", () => ({
  getLiveBuyerPaymentSessionState: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/live-room-payment-failure", () => ({
  getUnresolvedPaymentFailureForBuyer: vi.fn().mockResolvedValue(null),
  listUnresolvedPaymentFailuresForRoom: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/seller-follow-notify", () => ({
  notifyFollowersSellerWentLive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/seller/live-show-readiness", () => ({
  getSellerLiveReadiness: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/payments", () => ({
  processAuctionPaymentExpiries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/live-auction-finalize", () => ({
  finalizeOverdueLiveAuctionLotsForRoom: vi.fn().mockResolvedValue(undefined),
  LIVE_AUCTION_AUTO_CLOSE_GRACE_MS: 5000,
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitAuctionEnded: vi.fn(),
  emitAuctionStarted: vi.fn(),
  emitLiveDiscoveryChanged: vi.fn(),
  emitTeamBoardChanged: vi.fn(),
}));

vi.mock("@/lib/live-room-show-events", () => ({ postHostEndingLiveChatMessage: vi.fn() }));
vi.mock("@/lib/live-room-break-public", () => ({ computeBreakBuyerPhase: vi.fn() }));
vi.mock("@/lib/live-tip-moderator", () => ({ buildLiveTipRoomData: vi.fn() }));
vi.mock("@/lib/live-variant-checkout-preview-for-room", () => ({
  resolveLiveVariantCheckoutPreviewForActiveItem: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/live-tip-routing", () => ({ serializeLiveTipConfig: vi.fn() }));
vi.mock("@/lib/trust/live-replay-service", () => ({ finalizeLiveStreamReplay: vi.fn() }));
vi.mock("@/services/ivs", () => ({ endHostStageSession: vi.fn() }));
vi.mock("@/lib/log-room-state-snapshot", () => ({ logSellerRoomStateSnapshot: vi.fn() }));
vi.mock("@/lib/demo-seed-sellers", () => ({ isHiddenFixtureSellerEmail: vi.fn().mockReturnValue(false) }));
vi.mock("@/lib/live-loader-debug", () => ({
  logLiveLoaderDebug: vi.fn(),
  safeDecodeRouteSegment: (s: string) => s,
}));
vi.mock("@/lib/auth", () => ({ getServerSessionSafe: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/prisma-api-error-response", () => ({
  apiErrorResponseFromUnknown: vi.fn().mockReturnValue(new Response("error", { status: 500 })),
}));

describe("GET /api/live-rooms/[id] — combined viewer user fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveRoomFindUnique.mockResolvedValue({
      id: "room_1",
      sellerId: "seller_1",
      status: "live",
      roomType: "auction",
      items: [],
      messages: [],
    });
  });

  it("fetches the seller and viewer rows exactly once each, in parallel, not sequentially/duplicated", async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "seller_1") return { email: "seller@example.com" };
      if (where.id === "buyer_1") return { role: "buyer", email: "buyer@example.com" };
      return null;
    });

    const { GET } = await import("@/app/api/live-rooms/[id]/route");
    const res = await GET(new Request("https://example.com/api/live-rooms/room_1"), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).not.toBe(404);
    // Previously: 1 call for seller (email) + 1 call for viewer (role) + 1 call for viewer
    // (email) = 3 calls, with the viewer fetched twice. Now: exactly 2 calls total.
    expect(userFindUnique).toHaveBeenCalledTimes(2);
    const selects = userFindUnique.mock.calls.map((c) => (c[0] as { select: Record<string, boolean> }).select);
    const viewerCall = userFindUnique.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === "buyer_1",
    );
    expect(viewerCall?.[0]).toMatchObject({ select: { role: true, email: true } });
    expect(selects).toHaveLength(2);
  });
});
