import { describe, expect, it } from "vitest";
import {
  deriveAdminHealthOverall,
  recentIssuesFromChecks,
  type AdminHealthCheck,
} from "./admin-platform-health";

describe("admin-platform-health", () => {
  it("derives overall from worst check status", () => {
    expect(deriveAdminHealthOverall([{ status: "ok" } as AdminHealthCheck])).toBe("ok");
    expect(
      deriveAdminHealthOverall([
        { status: "ok" } as AdminHealthCheck,
        { status: "unknown" } as AdminHealthCheck,
      ]),
    ).toBe("degraded");
    expect(
      deriveAdminHealthOverall([
        { status: "degraded" } as AdminHealthCheck,
        { status: "error" } as AdminHealthCheck,
      ]),
    ).toBe("error");
  });

  it("builds recentIssues only for unhealthy checks with issue+solution", () => {
    const checks: AdminHealthCheck[] = [
      {
        id: "api",
        label: "API",
        status: "ok",
        detail: "fine",
        issue: null,
        solution: null,
      },
      {
        id: "live",
        label: "Live",
        status: "degraded",
        detail: "bad",
        issue: "Composition missing",
        solution: "Check IAM",
        log: "ivsCompositionArn=null",
        href: "/admin/live-shows",
      },
      {
        id: "stripe",
        label: "Stripe",
        status: "degraded",
        detail: "missing",
        // incomplete — should be skipped
      },
    ];
    const rows = recentIssuesFromChecks(checks, "2026-07-12T12:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checkId).toBe("live");
    expect(rows[0]?.href).toBe("/admin/live-shows");
  });
});
