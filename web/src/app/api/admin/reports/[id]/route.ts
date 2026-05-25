import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { adminUpdateReport, serializeReport } from "@/lib/trust/report-service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const row = await prisma.report.findUnique({
    where: { id: decodeURIComponent(id) },
    include: {
      reporter: { select: { id: true, username: true, email: true } },
      assignedAdmin: { select: { id: true, username: true } },
      auditLogs: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, username: true } } },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    report: serializeReport(row),
    reporterEmail: row.reporter.email,
    auditLogs: row.auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor,
    })),
  });
}

type PatchBody = {
  action?: string;
  assignedAdminId?: string;
  moderationNotes?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const reportId = decodeURIComponent(id);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action?.trim();
  if (!action || !["assign", "reviewing", "resolve", "dismiss", "note"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const updated = await adminUpdateReport({
      reportId,
      adminUserId: gate.userId,
      action: action as "assign" | "reviewing" | "resolve" | "dismiss" | "note",
      assignedAdminId: body.assignedAdminId,
      moderationNotes: body.moderationNotes,
    });
    return NextResponse.json({ report: serializeReport(updated) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed.";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
