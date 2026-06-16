import { NextResponse } from "next/server";
import { loadAdminFinanceCharts } from "@/lib/admin/admin-finance-aggregates";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const periodParam = (new URL(req.url).searchParams.get("period") ?? "daily").trim();
  const period = periodParam === "weekly" || periodParam === "monthly" ? periodParam : "daily";
  const points = await loadAdminFinanceCharts(period);
  return NextResponse.json({ period, points });
}
