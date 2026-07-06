import { NextResponse } from "next/server";
import { buildIvsEnvDiagnostics } from "@/lib/ivs-env-diagnostics";
import { isQaSessionDebugAllowed } from "@/lib/qa-session-debug-allowed";

/**
 * GET /api/qa/ivs-env-diagnostics — masked AWS IVS env visibility (no secrets).
 *
 * Gated solely by `isQaSessionDebugAllowed()` (dev, or `GV_ALLOW_QA_SESSION_DEBUG=1`). This
 * previously also allowed any request whose client-supplied `Host` header matched the beta
 * domain or a `*.netlify.app` suffix — since beta is a publicly reachable deployment, that let
 * any anonymous visitor read AWS access-key prefixes/lengths and credential-source info with no
 * authentication at all. Never reintroduce a host-based bypass here.
 */
export async function GET(req: Request) {
  if (!isQaSessionDebugAllowed()) {
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
