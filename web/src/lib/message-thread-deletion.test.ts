import { describe, expect, it } from "vitest";
import {
  DELETED_RETENTION_DAYS,
  deletedCutoff,
  purgeAtFor,
  threadVisibility,
} from "./message-thread-deletion";

const t = (iso: string) => new Date(iso);

describe("threadVisibility", () => {
  it("is active with no participant row or no delete", () => {
    expect(threadVisibility(null, t("2026-10-01T00:00:00Z"))).toBe("active");
    expect(threadVisibility({ deletedAt: null, purgedAt: null }, t("2026-10-01T00:00:00Z"))).toBe("active");
  });
  it("is deleted when nothing newer arrived", () => {
    const p = { deletedAt: t("2026-10-02T00:00:00Z"), purgedAt: null };
    expect(threadVisibility(p, t("2026-10-01T00:00:00Z"))).toBe("deleted");
    expect(threadVisibility(p, t("2026-10-02T00:00:00Z"))).toBe("deleted");
  });
  it("comes back to active when a newer message arrives", () => {
    const p = { deletedAt: t("2026-10-02T00:00:00Z"), purgedAt: null };
    expect(threadVisibility(p, t("2026-10-03T00:00:00Z"))).toBe("active");
  });
  it("is purged after permanent delete until something newer arrives", () => {
    const p = { deletedAt: t("2026-10-02T00:00:00Z"), purgedAt: t("2026-10-04T00:00:00Z") };
    expect(threadVisibility(p, t("2026-10-03T00:00:00Z"))).toBe("purged");
    expect(threadVisibility(p, t("2026-10-05T00:00:00Z"))).toBe("active");
  });
  it("treats a thread with no messages as at-or-before the delete", () => {
    expect(threadVisibility({ deletedAt: t("2026-10-02T00:00:00Z"), purgedAt: null }, null)).toBe("deleted");
  });
});

describe("retention", () => {
  it("is 14 days", () => {
    expect(DELETED_RETENTION_DAYS).toBe(14);
    expect(purgeAtFor(t("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(deletedCutoff(t("2026-10-15T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
