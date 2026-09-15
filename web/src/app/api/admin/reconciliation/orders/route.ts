import { NextResponse } from "next/server";
import { loadFinancialLedgerOrders } from "@/lib/admin/financial-ledger-loaders";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "50");

    const report = await loadFinancialLedgerOrders({
      range: url.searchParams.get("range"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      orderId: url.searchParams.get("orderId"),
      buyer: url.searchParams.get("buyer"),
      seller: url.searchParams.get("seller"),
      showId: url.searchParams.get("showId"),
      purchaseType: (url.searchParams.get("purchaseType") as "live" | "marketplace" | null) || null,
      paymentStatus: url.searchParams.get("paymentStatus"),
      paymentStatuses: url.searchParams.get("paymentStatuses"),
      fulfillmentStatus: url.searchParams.get("fulfillmentStatus"),
      payoutStatus: url.searchParams.get("payoutStatus"),
      payoutStatuses: url.searchParams.get("payoutStatuses"),
      paymentIntentId: url.searchParams.get("paymentIntentId"),
      chargeId: url.searchParams.get("chargeId"),
      transferId: url.searchParams.get("transferId"),
      transferReversalId: url.searchParams.get("transferReversalId"),
      trackingNumber: url.searchParams.get("trackingNumber"),
      reconciliationStatus: url.searchParams.get("reconciliationStatus"),
      hasLabel: url.searchParams.get("hasLabel"),
      unrecoveredLabel: url.searchParams.get("unrecoveredLabel"),
      hasTax: url.searchParams.get("hasTax"),
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });
    return NextResponse.json(report);
  } catch (e) {
    console.error("[admin/reconciliation/orders]", e);
    return NextResponse.json(
      {
        error: "ORDERS_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
