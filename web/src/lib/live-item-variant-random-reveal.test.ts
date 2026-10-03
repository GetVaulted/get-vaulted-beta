import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const hoisted = vi.hoisted(() => ({
  emitVaultRevealSpin: vi.fn(),
}));
vi.mock("@/lib/realtime-emit-server", () => ({ emitVaultRevealSpin: hoisted.emitVaultRevealSpin }));

const prismaMock = vi.hoisted(() => ({
  liveItemVariantPurchase: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  liveItemVariant: {
    findFirst: vi.fn().mockResolvedValue({ color: "nfl_teams" }),
  },
  liveRoomItem: {
    findUnique: vi.fn().mockResolvedValue({ teamBoardNcaa: false }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  executeRandomVariantRevealOnPurchase,
  remainingRandomPoolCount,
} from "@/lib/live-item-variant-random-reveal";

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

/** In-memory store of "already assigned" labels, simulating concurrent writers racing on the DB. */
function makeAssignedStore(initial: string[] = []) {
  const taken = new Set(initial.map((l) => l.trim().toLowerCase()));
  return {
    taken,
    findMany: vi.fn().mockImplementation(async () => {
      return Array.from(taken).map((label) => ({ revealedLabel: label }));
    }),
  };
}

describe("remainingRandomPoolCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ teamBoardNcaa: false });
    prismaMock.liveItemVariant.findFirst.mockResolvedValue({ color: "nfl_teams" });
  });

  it("counts unclaimed labels for team_break (8-division pool)", async () => {
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([
      { revealedLabel: "AFC East" },
      { revealedLabel: "NFC West" },
    ]);
    const remaining = await remainingRandomPoolCount({
      liveRoomItemId: "item_1",
      salesFormat: "team_break",
    });
    expect(remaining).toBe(6);
  });

  it("includes NCAA in NFL random team pool when flagged", async () => {
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([]);
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ teamBoardNcaa: true });
    const remaining = await remainingRandomPoolCount({
      liveRoomItemId: "item_1",
      salesFormat: "variant_selection",
      boardPack: "nfl",
      includeNcaa: true,
    });
    expect(remaining).toBe(33);
  });

  it("uses custom player pool for player_selection", async () => {
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue([]);
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({
      salesFormat: "player_selection",
      customRandomPoolLabels: ["Mahomes", "Allen", "Hurts"],
    });
    const remaining = await remainingRandomPoolCount({
      liveRoomItemId: "item_1",
      salesFormat: "player_selection",
    });
    expect(remaining).toBe(3);
  });

  it("returns 0 once every label in the pool has been claimed", async () => {
    const allDivisions = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];
    prismaMock.liveItemVariantPurchase.findMany.mockResolvedValue(
      allDivisions.map((label) => ({ revealedLabel: label })),
    );
    const remaining = await remainingRandomPoolCount({
      liveRoomItemId: "item_1",
      salesFormat: "team_break",
    });
    expect(remaining).toBe(0);
  });
});

describe("executeRandomVariantRevealOnPurchase — FIX 1 atomic pool draw", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns a label from the pool and broadcasts the reveal", async () => {
    const store = makeAssignedStore();
    prismaMock.liveItemVariantPurchase.findMany.mockImplementation(store.findMany);
    prismaMock.liveItemVariantPurchase.update.mockImplementation(async ({ data }: { data: { revealedLabel: string } }) => {
      store.taken.add(data.revealedLabel.trim().toLowerCase());
      return {};
    });

    const result = await executeRandomVariantRevealOnPurchase({
      purchaseId: "purchase_1",
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
      buyerUsername: "@buyer",
      itemTitle: "Mystery Box",
      salesFormat: "team_break",
    });

    expect(result).not.toBeNull();
    expect(result!.label.length).toBeGreaterThan(0);
    expect(hoisted.emitVaultRevealSpin).toHaveBeenCalledTimes(1);
  });

  it("retries against the updated taken-set when the write loses a race (P2002) and never leaves a duplicate", async () => {
    const store = makeAssignedStore();
    prismaMock.liveItemVariantPurchase.findMany.mockImplementation(store.findMany);

    // Simulate a concurrent writer winning the very first label this call tries to write.
    let firstAttempt = true;
    prismaMock.liveItemVariantPurchase.update.mockImplementation(async ({ data }: { data: { revealedLabel: string } }) => {
      if (firstAttempt) {
        firstAttempt = false;
        // Concurrent purchase claims this label between our read and our write.
        store.taken.add(data.revealedLabel.trim().toLowerCase());
        throw uniqueViolation();
      }
      store.taken.add(data.revealedLabel.trim().toLowerCase());
      return {};
    });

    const result = await executeRandomVariantRevealOnPurchase({
      purchaseId: "purchase_2",
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
      buyerUsername: "@buyer2",
      itemTitle: "Mystery Box",
      salesFormat: "team_break",
    });

    expect(result).not.toBeNull();
    expect(prismaMock.liveItemVariantPurchase.update).toHaveBeenCalledTimes(2);
    // Only ever one label ends up assigned per call — no duplicate ever gets persisted.
    expect(store.taken.size).toBe(2);
  });

  it("gives up gracefully (returns null) once the pool is exhausted rather than throwing", async () => {
    const allDivisions = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];
    const store = makeAssignedStore(allDivisions);
    prismaMock.liveItemVariantPurchase.findMany.mockImplementation(store.findMany);

    const result = await executeRandomVariantRevealOnPurchase({
      purchaseId: "purchase_3",
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
      buyerUsername: "@buyer3",
      itemTitle: "Mystery Box",
      salesFormat: "team_break",
    });

    expect(result).toBeNull();
    expect(prismaMock.liveItemVariantPurchase.update).not.toHaveBeenCalled();
  });

  it("FIX 6: survives more than 3 consecutive P2002 losses under contention instead of false-triggering exhaustion", async () => {
    // MAX_DRAW_ATTEMPTS was bumped from 3 to 8 specifically so that losing the race several times
    // in a row (high contention near pool exhaustion) doesn't falsely trigger the refund/alert
    // safety net when unclaimed labels still exist.
    const store = makeAssignedStore();
    prismaMock.liveItemVariantPurchase.findMany.mockImplementation(store.findMany);

    let attempts = 0;
    const LOSSES_BEFORE_SUCCESS = 5; // more than the old MAX_DRAW_ATTEMPTS of 3
    prismaMock.liveItemVariantPurchase.update.mockImplementation(async ({ data }: { data: { revealedLabel: string } }) => {
      attempts += 1;
      if (attempts <= LOSSES_BEFORE_SUCCESS) {
        // Simulate a concurrent purchase winning this exact label every time.
        store.taken.add(data.revealedLabel.trim().toLowerCase());
        throw uniqueViolation();
      }
      store.taken.add(data.revealedLabel.trim().toLowerCase());
      return {};
    });

    const result = await executeRandomVariantRevealOnPurchase({
      purchaseId: "purchase_contention",
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
      buyerUsername: "@buyer",
      itemTitle: "Mystery Box",
      salesFormat: "team_break",
    });

    expect(result).not.toBeNull();
    expect(attempts).toBe(LOSSES_BEFORE_SUCCESS + 1);
  });

  it("re-throws non-unique-constraint errors instead of retrying", async () => {
    const store = makeAssignedStore();
    prismaMock.liveItemVariantPurchase.findMany.mockImplementation(store.findMany);
    prismaMock.liveItemVariantPurchase.update.mockRejectedValue(new Error("boom"));

    await expect(
      executeRandomVariantRevealOnPurchase({
        purchaseId: "purchase_4",
        liveRoomId: "room_1",
        liveRoomItemId: "item_1",
        buyerUsername: "@buyer4",
        itemTitle: "Mystery Box",
        salesFormat: "team_break",
      }),
    ).rejects.toThrow("boom");
  });
});
