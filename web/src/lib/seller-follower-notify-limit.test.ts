import { describe, expect, it, vi } from "vitest";
import {
  FOLLOWER_NOTIFY_INTERVAL_MS,
  claimFollowerNotifySlot,
  releaseFollowerNotifySlot,
} from "./seller-follower-notify-limit";

const NOW = new Date("2026-10-09T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60000);

function fakeDb(last: Date | null, updateCount = 1) {
  const findUnique = vi.fn().mockResolvedValue({ followerNotifiedAt: last });
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  return { db: { user: { findUnique, updateMany } } as never, updateMany };
}

describe("claimFollowerNotifySlot", () => {
  it("is exactly one hour", () => {
    expect(FOLLOWER_NOTIFY_INTERVAL_MS).toBe(3_600_000);
  });

  it("allows the first notification", async () => {
    const { db, updateMany } = fakeDb(null);
    const res = await claimFollowerNotifySlot(db, "s1", NOW);
    expect(res.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", followerNotifiedAt: null },
      data: { followerNotifiedAt: NOW },
    });
  });

  it("blocks a second one inside the hour and says how long to wait", async () => {
    const { db, updateMany } = fakeDb(minsAgo(20));
    const res = await claimFollowerNotifySlot(db, "s1", NOW);
    expect(res).toEqual({ ok: false, retryAfterMinutes: 40 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("blocks at 59 minutes and allows at 60", async () => {
    expect((await claimFollowerNotifySlot(fakeDb(minsAgo(59)).db, "s1", NOW)).ok).toBe(false);
    expect((await claimFollowerNotifySlot(fakeDb(minsAgo(60)).db, "s1", NOW)).ok).toBe(true);
  });

  it("loses the race cleanly when another request claimed the slot first", async () => {
    const { db } = fakeDb(null, 0);
    expect((await claimFollowerNotifySlot(db, "s1", NOW)).ok).toBe(false);
  });
});

describe("releaseFollowerNotifySlot", () => {
  it("restores the previous time, only if our claim is still the latest", async () => {
    const { db, updateMany } = fakeDb(minsAgo(120));
    const slot = await claimFollowerNotifySlot(db, "s1", NOW);
    if (!slot.ok) throw new Error("expected slot");
    updateMany.mockClear();
    await releaseFollowerNotifySlot(db, "s1", slot);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s1", followerNotifiedAt: NOW },
      data: { followerNotifiedAt: minsAgo(120) },
    });
  });
});
