import { describe, expect, it, vi } from "vitest";
import { purgeExpiredDeletedThreads } from "./message-thread-cleanup";

function fakeDb(removable: { id: string }[], autoPurged = 3) {
  const executeRaw = vi.fn().mockResolvedValue(autoPurged);
  const queryRaw = vi.fn().mockResolvedValue(removable);
  const deleteMany = vi.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
    count: where.id.in.length,
  }));
  return {
    db: { $executeRaw: executeRaw, $queryRaw: queryRaw, messageThread: { deleteMany } } as never,
    executeRaw,
    deleteMany,
  };
}

describe("purgeExpiredDeletedThreads", () => {
  it("auto-purges expired deletes and removes threads both people deleted", async () => {
    const { db, deleteMany } = fakeDb([{ id: "t1" }, { id: "t2" }]);
    const res = await purgeExpiredDeletedThreads(db, new Date("2026-10-20T00:00:00Z"));
    expect(res).toEqual({ autoPurged: 3, threadsRemoved: 2 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t1", "t2"] } } });
  });

  it("does not delete anything when no thread qualifies", async () => {
    const { db, deleteMany } = fakeDb([], 0);
    const res = await purgeExpiredDeletedThreads(db);
    expect(res).toEqual({ autoPurged: 0, threadsRemoved: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("uses a 14-day cutoff for the auto-purge", async () => {
    const { db, executeRaw } = fakeDb([]);
    await purgeExpiredDeletedThreads(db, new Date("2026-10-20T00:00:00Z"));
    const values = executeRaw.mock.calls[0].slice(1) as Date[];
    expect(values.map((d) => d.toISOString())).toContain("2026-10-06T00:00:00.000Z");
  });
});
