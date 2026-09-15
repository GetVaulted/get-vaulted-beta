import { NextResponse } from "next/server";
import { loadFinancialOverview } from "@/lib/admin/financial-ledger-loaders";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(req.url);
    const report = await loadFinancialOverview({
      range: url.searchParams.get("range"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      orderId: url.searchParams.get("orderId"),
      seller: url.searchParams.get("seller"),
    });
    return NextResponse.json(report);
  } catch (e) {
    console.error("[admin/reconciliation/overview]", e);
    return NextResponse.json(
      {
        error: "OVERVIEW_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
