import { NextResponse } from "next/server";
import {
  ADMIN_EXPORT_REPORT_IDS,
  adminExportCsvResponse,
  buildAdminExportPayload,
  isAdminExportReportId,
} from "@/lib/admin/admin-export-reports";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const report = (url.searchParams.get("report") ?? "").trim();

  if (!report) {
    return NextResponse.json(
      { error: "report query param is required.", availableReports: ADMIN_EXPORT_REPORT_IDS },
      { status: 400 },
    );
  }

  if (!isAdminExportReportId(report)) {
    return NextResponse.json(
      { error: `Unknown report: ${report}`, availableReports: ADMIN_EXPORT_REPORT_IDS },
      { status: 400 },
    );
  }

  try {
    const payload = await buildAdminExportPayload(report, {
      range: url.searchParams.get("range") ?? undefined,
      period: url.searchParams.get("period") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      tier: url.searchParams.get("tier") ?? undefined,
      pending: url.searchParams.get("pending") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      campaignId: url.searchParams.get("campaignId") ?? undefined,
    });
    return adminExportCsvResponse(payload);
  } catch (e) {
    console.error("[admin/export]", report, e);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
