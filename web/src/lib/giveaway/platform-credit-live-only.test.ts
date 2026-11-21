import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCreditSourceType, PlatformCreditStatus } from "@/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  platformCredit: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  order: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  awardPlatformCredit,
  isLiveShowOrderForCredit,
  reservePlatformCreditForCheckout,
} from "@/lib/giveaway/platform-credit";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.platformCredit.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.platformCredit.create.mockResolvedValue({ id: "new" });
});

describe("awardPlatformCredit liveOnly", () => {
  it("stores liveOnly=true when requested", async () => {
    await awardPlatformCredit({
      userId: "u1",
      amountUsd: 500,
      sourceType: PlatformCreditSourceType.admin_grant,
      sourceRef: "ref1",
      liveOnly: true,
    });
    expect(prismaMock.platformCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ liveOnly: true }) }),
    );
  });

  it("defaults to liveOnly=false", async () => {
    await awardPlatformCredit({
      userId: "u1",
      amountUsd: 10,
      sourceType: PlatformCreditSourceType.admin_grant,
      sourceRef: "ref2",
    });
    expect(prismaMock.platformCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ liveOnly: false }) }),
    );
  });
});

describe("isLiveShowOrderForCredit", () => {
  it("is true only for an order attached to a live shipping session", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ liveShippingSessionId: "sess1" });
    expect(await isLiveShowOrderForCredit("o1")).toBe(true);
  });

  it("is false for a marketplace order", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ liveShippingSessionId: null });
    expect(await isLiveShowOrderForCredit("o1")).toBe(false);
  });

  it("is false (fails closed) when the order is missing or the lookup errors", async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    expect(await isLiveShowOrderForCredit("nope")).toBe(false);
    prismaMock.order.findUnique.mockRejectedValue(new Error("db down"));
    expect(await isLiveShowOrderForCredit("o1")).toBe(false);
  });
});

describe("reservePlatformCreditForCheckout live-only restriction", () => {
  it("excludes live-only credit on a marketplace order", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ liveShippingSessionId: null });
    prismaMock.platformCredit.findMany.mockResolvedValue([]);
    const applied = await reservePlatformCreditForCheckout("u1", 50, "market_order");
    expect(applied).toBe(0);
    const where = prismaMock.platformCredit.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      userId: "u1",
      status: PlatformCreditStatus.available,
      liveOnly: false,
    });
  });

  it("does not filter on liveOnly for a live-show order", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ liveShippingSessionId: "sess1" });
    prismaMock.platformCredit.findMany.mockResolvedValue([
      { id: "c1", amountUsd: 500, sourceType: "admin_grant", sourceRef: "r", liveOnly: true },
    ]);
    const applied = await reservePlatformCreditForCheckout("u1", 20, "live_order");
    expect(applied).toBe(20);
    const where = prismaMock.platformCredit.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("liveOnly");
  });

  it("carries liveOnly onto the split reserved chunk", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ liveShippingSessionId: "sess1" });
    prismaMock.platformCredit.findMany.mockResolvedValue([
      { id: "c1", amountUsd: 500, sourceType: "admin_grant", sourceRef: "r", liveOnly: true },
    ]);
    await reservePlatformCreditForCheckout("u1", 20, "live_order");
    expect(prismaMock.platformCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ liveOnly: true, status: PlatformCreditStatus.reserved }),
      }),
    );
  });

  it("treats an unknown/failed order lookup as marketplace (never spends live-only credit)", async () => {
    prismaMock.order.findUnique.mockRejectedValue(new Error("db down"));
    prismaMock.platformCredit.findMany.mockResolvedValue([]);
    await reservePlatformCreditForCheckout("u1", 20, "mystery_ref");
    const where = prismaMock.platformCredit.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ liveOnly: false });
  });
});
