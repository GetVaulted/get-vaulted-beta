import { NextResponse } from "next/server";
import { loadFinancialTaxReport } from "@/lib/admin/financial-ledger-loaders";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const report = await loadFinancialTaxReport({
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  return NextResponse.json(report);
}
