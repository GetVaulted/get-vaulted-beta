import { NextResponse } from "next/server";
import { rowsToCsv } from "@/lib/admin/admin-csv";
import { loadDailyReport } from "@/lib/admin/admin-daily-report";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const report = await loadDailyReport(Number(url.searchParams.get("days") ?? 30));
  if (url.searchParams.get("format") === "csv") {
    const csv = rowsToCsv(
      ["Day (UTC)", "Paid orders", "Sales (USD)", "Refunds completed", "New members"],
      report.days.map((d) => [d.day, d.orders, d.gmvUsd.toFixed(2), d.refunds, d.newMembers]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="daily-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return NextResponse.json(report);
}
