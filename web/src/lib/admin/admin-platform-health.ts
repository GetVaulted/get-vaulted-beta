/** Shared types for GET /api/admin/health and the admin health UI. */

export type AdminHealthStatus = "ok" | "degraded" | "unknown" | "error";

export type AdminHealthCheck = {
  id: string;
  label: string;
  status: AdminHealthStatus;
  detail: string;
  /** Plain-English what’s wrong (null when healthy). */
  issue?: string | null;
  /** Concrete next step (null when healthy). */
  solution?: string | null;
  /** Short technical line (error code / lastIvsError). */
  log?: string | null;
  /** Deep link for ops (e.g. /admin/live-shows). */
  href?: string | null;
};

export type AdminHealthRecentIssue = {
  id: string;
  checkId: string;
  label: string;
  status: AdminHealthStatus;
  issue: string;
  solution: string;
  log?: string | null;
  href?: string | null;
  at: string;
};

export type AdminHealthPayload = {
  overall: AdminHealthStatus;
  checks: AdminHealthCheck[];
  recentIssues: AdminHealthRecentIssue[];
  updatedAt: string;
};

export function deriveAdminHealthOverall(checks: AdminHealthCheck[]): AdminHealthStatus {
  if (checks.some((c) => c.status === "error")) return "error";
  if (checks.some((c) => c.status === "degraded" || c.status === "unknown")) return "degraded";
  return "ok";
}

export function recentIssuesFromChecks(
  checks: AdminHealthCheck[],
  updatedAt: string,
  limit = 10,
): AdminHealthRecentIssue[] {
  const out: AdminHealthRecentIssue[] = [];
  for (const c of checks) {
    if (c.status === "ok") continue;
    if (!c.issue || !c.solution) continue;
    out.push({
      id: `${c.id}-${updatedAt}`,
      checkId: c.id,
      label: c.label,
      status: c.status,
      issue: c.issue,
      solution: c.solution,
      log: c.log ?? null,
      href: c.href ?? null,
      at: updatedAt,
    });
  }
  return out.slice(0, limit);
}
