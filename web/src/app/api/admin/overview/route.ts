import { NextResponse } from "next/server";
import { loadAdminOverviewMetrics } from "@/lib/admin/load-admin-overview-metrics";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const metrics = await loadAdminOverviewMetrics();
  return NextResponse.json(metrics);
}
