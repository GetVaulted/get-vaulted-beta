import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const tradeOfferItemCount = vi.fn();
const orderCount = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
    tradeOfferItem: { count: (...args: unknown[]) => tradeOfferItemCount(...args) },
    order: { count: (...args: unknown[]) => orderCount(...args) },
  },
}));

vi.mock("@/lib/resolve-listings-auth", () => ({
  resolveListingsUserId: vi.fn().mockResolvedValue({ userId: "seller-1" }),
}));

import { DELETE } from "@/app/api/listings/[id]/route";

// Regression: TradeOfferItem.listing and Order.listing use `onDelete: Restrict`, so deleting a
// listing that's ever been part of a trade offer or order previously crashed with an uncaught
// FK-violation 500 instead of a clean, actionable error.
describe("DELETE /api/listings/[id]", () => {
  beforeEach(() => {
    findFirst.mockReset();
    tradeOfferItemCount.mockReset();
    orderCount.mockReset();
    deleteMany.mockReset();
  });

  const req = () => new Request("https://example.com/api/listings/listing-1", { method: "DELETE" });
  const ctx = { params: Promise.resolve({ id: "listing-1" }) };

  it("returns 404 when the listing doesn't exist (or isn't owned by the caller)", async () => {
    findFirst.mockResolvedValue(null);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 with LISTING_HAS_DEPENDENCIES instead of crashing when trade offers exist", async () => {
    findFirst.mockResolvedValue({ id: "listing-1" });
    tradeOfferItemCount.mockResolvedValue(1);
    orderCount.mockResolvedValue(0);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("LISTING_HAS_DEPENDENCIES");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("returns 409 with LISTING_HAS_DEPENDENCIES instead of crashing when orders exist", async () => {
    findFirst.mockResolvedValue({ id: "listing-1" });
    tradeOfferItemCount.mockResolvedValue(0);
    orderCount.mockResolvedValue(1);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("LISTING_HAS_DEPENDENCIES");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("deletes normally when there are no dependent rows", async () => {
    findFirst.mockResolvedValue({ id: "listing-1" });
    tradeOfferItemCount.mockResolvedValue(0);
    orderCount.mockResolvedValue(0);
    deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("still returns 409 (not a 500) if the DB throws a foreign-key error despite the pre-check", async () => {
    findFirst.mockResolvedValue({ id: "listing-1" });
    tradeOfferItemCount.mockResolvedValue(0);
    orderCount.mockResolvedValue(0);
    const { Prisma } = await import("@/generated/prisma/client");
    deleteMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
        code: "P2003",
        clientVersion: "test",
      }),
    );
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("LISTING_HAS_DEPENDENCIES");
  });
});
