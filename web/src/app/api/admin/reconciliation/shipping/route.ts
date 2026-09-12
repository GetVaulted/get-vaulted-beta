import { NextResponse } from "next/server";
import type { ReconciliationRangeKey } from "@/lib/admin/admin-reconciliation";
import {
  loadAdminOutstandingShippingLiabilityReport,
  loadAdminShippingReconciliationReport,
  type LabelLiabilityDisplayStatus,
} from "@/lib/admin/shipping-reconciliation";
import { requireAdmin } from "@/lib/require-admin";

const VALID_RANGES: ReconciliationRangeKey[] = ["24h", "7d", "30d", "90d", "all"];
const VALID_LIABILITY_STATUSES: LabelLiabilityDisplayStatus[] = [
  "recovered",
  "partially_recovered",
  "outstanding",
  "refund_pending",
  "credited",
  "written_off",
];

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);

  // Ledger-level (ShipmentLabelFinance) outstanding-liability view — additive, does not change the
  // existing order-level `view=order` (default) response shape below.
  if (url.searchParams.get("view") === "liability") {
    const rawStatus = url.searchParams.get("status");
    const statusFilter = (VALID_LIABILITY_STATUSES as string[]).includes(rawStatus ?? "")
      ? (rawStatus as LabelLiabilityDisplayStatus)
      : undefined;
    const report = await loadAdminOutstandingShippingLiabilityReport({ statusFilter });
    return NextResponse.json(report);
  }

  const rawRange = url.searchParams.get("range") ?? "30d";
  const range = (VALID_RANGES as string[]).includes(rawRange)
    ? (rawRange as ReconciliationRangeKey)
    : "30d";
  const flaggedOnly = url.searchParams.get("flaggedOnly") === "1";

  const report = await loadAdminShippingReconciliationReport(range, { flaggedOnly });
  return NextResponse.json(report);
}
