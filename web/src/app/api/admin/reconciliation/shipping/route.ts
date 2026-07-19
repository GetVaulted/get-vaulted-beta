import { NextResponse } from "next/server";
import type { ReconciliationRangeKey } from "@/lib/admin/admin-reconciliation";
import { loadAdminShippingReconciliationReport } from "@/lib/admin/shipping-reconciliation";
import { requireAdmin } from "@/lib/require-admin";

const VALID_RANGES: ReconciliationRangeKey[] = ["24h", "7d", "30d", "90d", "all"];

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const rawRange = url.searchParams.get("range") ?? "30d";
  const range = (VALID_RANGES as string[]).includes(rawRange)
    ? (rawRange as ReconciliationRangeKey)
    : "30d";
  const flaggedOnly = url.searchParams.get("flaggedOnly") === "1";

  const report = await loadAdminShippingReconciliationReport(range, { flaggedOnly });
  return NextResponse.json(report);
}
