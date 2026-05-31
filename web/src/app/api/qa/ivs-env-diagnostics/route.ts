import { NextResponse } from "next/server";
import { buildIvsEnvDiagnostics } from "@/lib/ivs-env-diagnostics";
import { isQaSessionDebugAllowed } from "@/lib/qa-session-debug-allowed";

function isBetaHost(req: Request): boolean {
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  return host === "beta.shopgetvaulted.com" || host.endsWith(".netlify.app");
}

/** GET /api/qa/ivs-env-diagnostics — masked AWS IVS env visibility (no secrets). */
export async function GET(req: Request) {
  if (!isQaSessionDebugAllowed() && !isBetaHost(req)) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const diagnostics = buildIvsEnvDiagnostics();
  return NextResponse.json({
    ok: true,
    host: req.headers.get("host"),
    netlify: {
      context: diagnostics.deployContext,
      url: process.env.URL?.trim() || null,
      deployUrl: process.env.DEPLOY_URL?.trim() || null,
      branch: process.env.BRANCH?.trim() || process.env.HEAD?.trim() || null,
    },
    ivs: diagnostics,
  });
}
