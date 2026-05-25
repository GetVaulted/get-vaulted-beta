import { NextResponse } from "next/server";
import type { ReportStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { serializeReport } from "@/lib/trust/report-service";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() as ReportStatus | undefined;
  const targetType = url.searchParams.get("targetType")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const rows = await prisma.report.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(targetType ? { targetType: targetType as never } : {}),
      ...(q
        ? {
            OR: [
              { targetId: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { reporter: { username: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { id: true, username: true } },
      assignedAdmin: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json({ reports: rows.map(serializeReport) });
}
