import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_LINKS,
  ADMIN_NAV_PINNED,
  activeAdminNavHref,
  adminNavGroupIdForHref,
} from "@/lib/admin/admin-modules";

describe("admin nav", () => {
  it("lists every page exactly once", () => {
    const hrefs = ADMIN_NAV_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(35);
  });

  it("pins Command Center and Needs attention outside the groups", () => {
    expect(ADMIN_NAV_PINNED.map((l) => l.label)).toEqual(["Command Center", "Needs attention"]);
    for (const g of ADMIN_NAV_GROUPS) {
      expect(g.links.length).toBeGreaterThan(0);
    }
  });

  it("highlights only the most specific link", () => {
    expect(activeAdminNavHref("/admin/payouts")).toBe("/admin/payouts");
    expect(activeAdminNavHref("/admin/payouts/paypal")).toBe("/admin/payouts/paypal");
    expect(activeAdminNavHref("/admin/live-shows/move")).toBe("/admin/live-shows/move");
    expect(activeAdminNavHref("/admin/live-shows/abc123")).toBe("/admin/live-shows");
    expect(activeAdminNavHref("/admin/trust/linked-accounts")).toBe("/admin/trust/linked-accounts");
    expect(activeAdminNavHref("/admin")).toBe("/admin");
  });

  it("does not light up Command Center on other pages", () => {
    expect(activeAdminNavHref("/admin/finance")).toBe("/admin/finance");
  });

  it("finds the section for a page", () => {
    expect(adminNavGroupIdForHref("/admin/payouts/paypal")).toBe("money");
    expect(adminNavGroupIdForHref("/admin/users-management")).toBe("people");
    expect(adminNavGroupIdForHref("/admin")).toBeNull();
    expect(adminNavGroupIdForHref(null)).toBeNull();
  });
});
