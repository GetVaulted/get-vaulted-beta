import { describe, expect, it } from "vitest";
import {
  buildProfileTrust,
  loadSellerSalesCount,
  sellerFollowerWhere,
  shapeProfileShows,
} from "@/lib/seller-profile-public";

const row = (id: string, status: "live" | "scheduled" | "ended", over: Record<string, unknown> = {}) => ({
  id,
  title: `Show ${id}`,
  category: "Cards",
  status,
  thumbnailUrl: "",
  scheduledStartAt: null,
  startedAt: null,
  endedAt: null,
  ...over,
});

describe("shapeProfileShows", () => {
  it("fills live, next and last-live slots", () => {
    const out = shapeProfileShows({
      live: [row("a", "live")],
      scheduled: [row("b", "scheduled", { scheduledStartAt: new Date("2026-10-10T20:00:00Z") })],
      ended: [row("c", "ended"), row("d", "ended")],
      totalShows: 9,
    });
    expect(out.liveNow?.id).toBe("a");
    expect(out.nextShow?.scheduledStartAt).toBe("2026-10-10T20:00:00.000Z");
    expect(out.lastLive?.id).toBe("c");
    expect(out.recent.map((s) => s.id)).toEqual(["c", "d"]);
    expect(out.totalShows).toBe(9);
  });
  it("is empty-safe and caps recent shows at five", () => {
    const empty = shapeProfileShows({ live: [], scheduled: [], ended: [], totalShows: 0 });
    expect(empty).toEqual({ liveNow: null, nextShow: null, lastLive: null, recent: [], totalShows: 0 });
    const many = shapeProfileShows({
      live: [],
      scheduled: [],
      ended: Array.from({ length: 8 }, (_, i) => row(`e${i}`, "ended")),
      totalShows: 8,
    });
    expect(many.recent).toHaveLength(5);
  });
  it("turns blank thumbnails into null", () => {
    const out = shapeProfileShows({ live: [row("a", "live", { thumbnailUrl: "  " })], scheduled: [], ended: [], totalShows: 0 });
    expect(out.liveNow?.thumbnailUrl).toBeNull();
  });
});

describe("buildProfileTrust", () => {
  it("labels the level and flags verified email", () => {
    const t = buildProfileTrust({
      sellerLevel: "trusted_seller",
      ordersCompleted: 48,
      createdAt: new Date("2026-08-02T00:00:00Z"),
      emailVerified: new Date(),
    });
    expect(t.sellerLevelLabel).toBe("Trusted Seller");
    expect(t.emailVerified).toBe(true);
    expect(t.ordersCompleted).toBe(48);
    expect(buildProfileTrust({ sellerLevel: "vault_seller", ordersCompleted: 0, createdAt: new Date(), emailVerified: null }).emailVerified).toBe(false);
  });
});

describe("loadSellerSalesCount", () => {
  it("returns the combined count as a number (bigint from Postgres)", async () => {
    const db = { $queryRaw: async () => [{ count: BigInt(126) }] } as never;
    expect(await loadSellerSalesCount(db, "seller-1")).toBe(126);
  });
  it("defaults to 0 when there is no row", async () => {
    const db = { $queryRaw: async () => [] } as never;
    expect(await loadSellerSalesCount(db, "seller-1")).toBe(0);
  });
});

describe("sellerFollowerWhere", () => {
  it("only counts followers with active accounts", () => {
    expect(sellerFollowerWhere("s1")).toEqual({
      sellerId: "s1",
      follower: { accountDeletedAt: null, suspendedAt: null },
    });
  });
});
