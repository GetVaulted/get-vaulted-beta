import { NextResponse } from "next/server";
import { loadAdminOverviewMetrics } from "@/lib/admin/load-admin-overview-metrics";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const metrics = await loadAdminOverviewMetrics();
  return NextResponse.json(metrics);
}
