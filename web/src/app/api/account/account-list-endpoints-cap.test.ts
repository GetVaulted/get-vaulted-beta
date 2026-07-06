import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: several account list endpoints previously ran `findMany` with no `take` at all
// (performance audit 2026-07). This verifies each now applies a defensive cap.

const watchlistFindMany = vi.fn().mockResolvedValue([]);
const offerFindMany = vi.fn().mockResolvedValue([]);
const sellerFollowFindMany = vi.fn().mockResolvedValue([]);
const messageThreadFindMany = vi.fn().mockResolvedValue([]);
const messageGroupBy = vi.fn().mockResolvedValue([]);
const listingOfferFindMany = vi.fn().mockResolvedValue([]);
const orderFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    watchlistItem: { findMany: (...a: unknown[]) => watchlistFindMany(...a) },
    offer: { findMany: (...a: unknown[]) => offerFindMany(...a) },
    sellerFollow: { findMany: (...a: unknown[]) => sellerFollowFindMany(...a) },
    messageThread: {
      findMany: (...a: unknown[]) => messageThreadFindMany(...a),
      count: vi.fn().mockResolvedValue(0),
    },
    message: { groupBy: (...a: unknown[]) => messageGroupBy(...a) },
    order: { findMany: (...a: unknown[]) => orderFindMany(...a) },
    listing: { findUnique: vi.fn().mockResolvedValue({ id: "l1", sellerId: "u1", title: "T" }) },
  },
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getServerSessionSafe: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
}));

vi.mock("@/lib/resolve-account-auth", () => ({
  resolveAccountUserId: vi.fn().mockResolvedValue({ userId: "u1" }),
}));

function takeOf(mockFn: ReturnType<typeof vi.fn>): number | undefined {
  const args = mockFn.mock.calls[0]?.[0] as { take?: number } | undefined;
  return args?.take;
}

describe("account list endpoints apply defensive row caps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/account/watchlist caps rows", async () => {
    const { GET } = await import("@/app/api/account/watchlist/route");
    await GET();
    expect(takeOf(watchlistFindMany)).toBeGreaterThan(0);
  });

  it("GET /api/account/offers caps rows", async () => {
    const { GET } = await import("@/app/api/account/offers/route");
    await GET();
    expect(takeOf(offerFindMany)).toBeGreaterThan(0);
  });

  it("GET /api/account/follows caps both following and follower rows", async () => {
    const { GET } = await import("@/app/api/account/follows/route");
    await GET(new Request("https://example.com/api/account/follows"));
    expect(sellerFollowFindMany).toHaveBeenCalledTimes(2);
    for (const call of sellerFollowFindMany.mock.calls) {
      expect((call[0] as { take?: number }).take).toBeGreaterThan(0);
    }
  });

  it("GET /api/account/threads caps rows", async () => {
    const { GET } = await import("@/app/api/account/threads/route");
    await GET(new Request("https://example.com/api/account/threads"));
    expect(takeOf(messageThreadFindMany)).toBeGreaterThan(0);
  });

  it("GET /api/listings/[id]/offers caps rows", async () => {
    listingOfferFindMany.mockResolvedValue([]);
    offerFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/listings/[id]/offers/route");
    await GET(new Request("https://example.com/api/listings/l1/offers"), {
      params: Promise.resolve({ id: "l1" }),
    });
    expect(takeOf(offerFindMany)).toBeGreaterThan(0);
  });
});
