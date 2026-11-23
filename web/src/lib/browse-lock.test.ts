import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique } } }));

import { isBrowseLockedViewer } from "@/lib/browse-lock";

describe("isBrowseLockedViewer", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("is false for guests and blank ids without touching the database", async () => {
    expect(await isBrowseLockedViewer(null)).toBe(false);
    expect(await isBrowseLockedViewer(undefined)).toBe(false);
    expect(await isBrowseLockedViewer("   ")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("is true when the account has a browse lock", async () => {
    findUnique.mockResolvedValue({ browseLockedAt: new Date("2026-11-23T00:00:00Z") });
    expect(await isBrowseLockedViewer("user_1")).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user_1" }, select: { browseLockedAt: true } });
  });

  it("is false for an ordinary account or a missing row", async () => {
    findUnique.mockResolvedValueOnce({ browseLockedAt: null });
    expect(await isBrowseLockedViewer("user_2")).toBe(false);
    findUnique.mockResolvedValueOnce(null);
    expect(await isBrowseLockedViewer("user_3")).toBe(false);
  });

  it("fails open when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockRejectedValue(new Error("db down"));
    expect(await isBrowseLockedViewer("user_4")).toBe(false);
    spy.mockRestore();
  });
});
