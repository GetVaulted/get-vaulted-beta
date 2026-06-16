import { NextResponse } from "next/server";
import { loadAdminFinanceCharts, loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const summary = await loadAdminFinanceSummary();
  return NextResponse.json(summary);
}
