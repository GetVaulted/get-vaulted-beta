import { NextResponse } from "next/server";
import { buildQaSessionDebugPayload } from "@/lib/build-qa-session-debug";
import { isQaSessionDebugAllowed } from "@/lib/qa-session-debug-allowed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/qa/session-debug — deterministic QA snapshot for web + mobile diagnostics.
 * Allowed in development or when GV_ALLOW_QA_SESSION_DEBUG=1.
 */
export async function GET(request: Request) {
  if (!isQaSessionDebugAllowed()) {
    return NextResponse.json({ error: "QA session debug is disabled in this environment." }, { status: 404 });
  }

  try {
    const payload = await buildQaSessionDebugPayload(request);
    if (payload instanceof NextResponse) return payload;
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[qa/session-debug]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build QA session debug." },
      { status: 500 },
    );
  }
}
