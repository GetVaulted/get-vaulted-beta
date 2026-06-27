import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { createReport } from "@/lib/trust/report-service";
import { isReportReason, isReportTargetType } from "@/lib/trust/report-types";

type Body = {
  targetType?: string;
  targetId?: string;
  reason?: string;
  description?: string;
  liveRoomId?: string;
};

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isReportTargetType(targetType)) {
    return NextResponse.json({ error: "Invalid target type." }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ error: "Target id required." }, { status: 400 });
  }
  if (!isReportReason(reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }

  try {
    const report = await createReport({
      reporterUserId: auth.userId,
      targetType,
      targetId,
      reason,
      description: typeof body.description === "string" ? body.description : "",
      liveRoomId: typeof body.liveRoomId === "string" ? body.liveRoomId : null,
    });
    return NextResponse.json({ ok: true, reportId: report.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not submit report.";
    if (msg.includes("not found")) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
