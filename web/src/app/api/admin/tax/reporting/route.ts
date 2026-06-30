import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { aggregateTaxReporting, listNexusMonitoringByState } from "@/lib/sales-tax-reporting";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const stateCode = url.searchParams.get("state") ?? undefined;
  const sellerId = url.searchParams.get("sellerId") ?? undefined;
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const view = url.searchParams.get("view") ?? "summary";

  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;

  if (view === "nexus-monitor") {
    const rows = await listNexusMonitoringByState({ from, to });
    return NextResponse.json({ rows });
  }

  const summary = await aggregateTaxReporting({ stateCode, sellerId, from, to });
  const refunded = await aggregateTaxReporting({ stateCode, sellerId, from, to, refundedOnly: true });

  return NextResponse.json({
    summary,
    refunded,
    filters: { stateCode, sellerId, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
  });
}
