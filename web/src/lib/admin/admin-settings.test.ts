import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { adminSetting: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { clearAdminSettingCache, getBoolAdminSetting, parseBoolSetting } from "./admin-settings";

describe("admin settings", () => {
  beforeEach(() => {
    findUnique.mockReset();
    clearAdminSettingCache();
    delete process.env.SELLER_APPLICATIONS_ENFORCED;
  });
  it("parses common truthy and falsy strings, null otherwise", () => {
    expect(parseBoolSetting("On")).toBe(true);
    expect(parseBoolSetting("0")).toBe(false);
    expect(parseBoolSetting("maybe")).toBeNull();
    expect(parseBoolSetting(null)).toBeNull();
  });
  it("saved value wins over env, env is the fallback, default is off", async () => {
    findUnique.mockResolvedValueOnce({ value: "false" });
    process.env.SELLER_APPLICATIONS_ENFORCED = "1";
    expect(await getBoolAdminSetting("seller_applications_enforced")).toBe(false);
    clearAdminSettingCache();
    findUnique.mockResolvedValueOnce(null);
    expect(await getBoolAdminSetting("seller_applications_enforced")).toBe(true);
    clearAdminSettingCache();
    delete process.env.SELLER_APPLICATIONS_ENFORCED;
    findUnique.mockResolvedValueOnce(null);
    expect(await getBoolAdminSetting("seller_applications_enforced")).toBe(false);
  });
  it("falls back to env when the database read fails", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    process.env.SELLER_APPLICATIONS_ENFORCED = "true";
    expect(await getBoolAdminSetting("seller_applications_enforced")).toBe(true);
  });
});
