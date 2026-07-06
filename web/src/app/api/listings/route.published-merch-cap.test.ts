import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
const count = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args),
    },
    order: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/services/payments", () => ({
  processAuctionPaymentExpiries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/listing-mapper", () => ({
  dbListingToMarketplace: (r: unknown) => r,
  dbListingToStored: (r: unknown) => r,
}));

import { GET } from "@/app/api/listings/route";

// Regression: scope=published and scope=merch previously ran `findMany` with no `take` at
// all, returning the entire catalog on every request (performance audit 2026-07).
describe("GET /api/listings — defensive row cap on unpaginated public scopes", () => {
  beforeEach(() => {
    findMany.mockClear();
    count.mockClear();
  });

  it("caps scope=published rows", async () => {
    await GET(new Request("https://example.com/api/listings?scope=published"));
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]?.[0] as { take?: number };
    expect(typeof args.take).toBe("number");
    expect(args.take).toBeGreaterThan(0);
  });

  it("caps scope=merch rows", async () => {
    await GET(new Request("https://example.com/api/listings?scope=merch"));
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]?.[0] as { take?: number };
    expect(typeof args.take).toBe("number");
    expect(args.take).toBeGreaterThan(0);
  });
});
