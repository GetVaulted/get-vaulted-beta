import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: {
    liveGiveaway: { findMany: vi.fn(), update: vi.fn() },
    liveGiveawayEntry: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomGiveawaysChanged: vi.fn(),
  emitPurchaseCompleted: vi.fn(),
  emitVaultRevealSpin: vi.fn(),
}));
vi.mock("@/lib/live-giveaway-fulfillment", () => ({ createOrderFromGiveawayWinTx: vi.fn() }));
vi.mock("@/lib/giveaway-countdown", () => ({ scheduledGiveawayEntryCloseAt: vi.fn() }));

import {
  enterOpenGiveaway,
  pauseOpenGiveawayPresence,
  resumeOpenGiveawayPresence,
} from "@/lib/live-giveaway";

const OPEN = { id: "g1", entryCloseAt: new Date(Date.now() + 60_000) };

function setup(entry: Record<string, unknown> | null) {
  // processExpiredLiveGiveaways -> nothing due; open giveaway lookup -> one open giveaway
  hoisted.prisma.liveGiveaway.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    "entryCloseAt" in args.where ? [] : [OPEN],
  );
  hoisted.prisma.liveGiveawayEntry.findUnique.mockResolvedValue(entry);
  hoisted.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      liveGiveawayEntry: hoisted.prisma.liveGiveawayEntry,
      liveGiveaway: hoisted.prisma.liveGiveaway,
    }),
  );
  hoisted.prisma.liveGiveawayEntry.updateMany.mockResolvedValue({ count: 1 });
  hoisted.prisma.liveGiveaway.update.mockResolvedValue({});
  hoisted.prisma.liveGiveawayEntry.update.mockResolvedValue({});
}

describe("giveaway presence — out-of-order leave/join", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores a 'left' that lands moments after the viewer was confirmed present", async () => {
    setup({ id: "e1", method: "watch_enter", activeInRoom: true, presenceAt: new Date(Date.now() - 1_000) });
    const r = await pauseOpenGiveawayPresence("room1", "u1");
    expect(r).toEqual({ paused: 0, ignored: 1 });
    expect(hoisted.prisma.liveGiveawayEntry.updateMany).not.toHaveBeenCalled();
    expect(hoisted.prisma.liveGiveaway.update).not.toHaveBeenCalled();
  });

  it("still pauses a viewer who really left (no recent presence)", async () => {
    setup({ id: "e1", method: "watch_enter", activeInRoom: true, presenceAt: new Date(Date.now() - 60_000) });
    const r = await pauseOpenGiveawayPresence("room1", "u1");
    expect(r).toEqual({ paused: 1, ignored: 0 });
    expect(hoisted.prisma.liveGiveawayEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", activeInRoom: true },
      data: { activeInRoom: false },
    });
    expect(hoisted.prisma.liveGiveaway.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { entryCount: { decrement: 1 } },
    });
  });

  it("still pauses older rows that have no presence stamp", async () => {
    setup({ id: "e1", method: "watch_enter", activeInRoom: true, presenceAt: null });
    expect((await pauseOpenGiveawayPresence("room1", "u1")).paused).toBe(1);
  });

  it("a join stamps presence on an entry that is already counted, so a late 'left' cannot pause it", async () => {
    setup({ id: "e1", method: "watch_enter", activeInRoom: true });
    const r = await resumeOpenGiveawayPresence("room1", "u1");
    expect(r.resumed).toBe(0);
    expect(hoisted.prisma.liveGiveawayEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { presenceAt: expect.any(Date) },
    });
    expect(hoisted.prisma.liveGiveaway.update).not.toHaveBeenCalled();
  });

  it("a join restores a paused viewer, stamps presence and counts them again", async () => {
    setup({ id: "e1", method: "watch_enter", activeInRoom: false });
    const r = await resumeOpenGiveawayPresence("room1", "u1");
    expect(r.resumed).toBe(1);
    expect(hoisted.prisma.liveGiveawayEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", activeInRoom: false },
      data: { activeInRoom: true, presenceAt: expect.any(Date) },
    });
    expect(hoisted.prisma.liveGiveaway.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { entryCount: { increment: 1 } },
    });
  });

  it("never touches purchase / AMOE entries", async () => {
    setup({ id: "e1", method: "purchase", activeInRoom: true, presenceAt: null });
    expect((await pauseOpenGiveawayPresence("room1", "u1")).paused).toBe(0);
    expect((await resumeOpenGiveawayPresence("room1", "u1")).resumed).toBe(0);
    expect(hoisted.prisma.liveGiveawayEntry.update).not.toHaveBeenCalled();
  });

  it("entering stamps presence, so a stray 'left' right after tapping Enter cannot drop the entrant", async () => {
    hoisted.prisma.liveGiveaway.findMany.mockResolvedValue([]);
    hoisted.prisma.liveGiveaway.findFirst = vi.fn().mockResolvedValue({
      id: "g1",
      kind: "open",
      status: "entries_open",
      entryCloseAt: new Date(Date.now() + 60_000),
    });
    hoisted.prisma.liveGiveawayEntry.findUnique.mockResolvedValue(null);
    hoisted.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ liveGiveawayEntry: hoisted.prisma.liveGiveawayEntry, liveGiveaway: hoisted.prisma.liveGiveaway }),
    );
    hoisted.prisma.liveGiveawayEntry.create.mockResolvedValue({});
    hoisted.prisma.liveGiveaway.update.mockResolvedValue({});
    const r = await enterOpenGiveaway("g1", "room1", "u1");
    expect(r.ok).toBe(true);
    expect(hoisted.prisma.liveGiveawayEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ method: "watch_enter", activeInRoom: true, presenceAt: expect.any(Date) }),
    });
  });
});
