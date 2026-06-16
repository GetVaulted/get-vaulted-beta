import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

type HealthCheck = {
  id: string;
  label: string;
  status: "ok" | "degraded" | "unknown" | "error";
  detail: string;
  /** TODO endpoints to wire for live probes */
  probeEndpoint?: string;
};

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const checks: HealthCheck[] = [];

  // Supabase — env presence only (no external ping to avoid leaking keys).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  checks.push({
    id: "supabase",
    label: "Supabase",
    status: supabaseUrl ? "ok" : "error",
    detail: supabaseUrl ? "URL configured" : "Missing SUPABASE_URL",
    probeEndpoint: "TODO: GET /api/admin/health/supabase",
  });

  // API / Netlify — self ping via DB.
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      id: "api",
      label: "API / Database",
      status: "ok",
      detail: "Prisma connected",
    });
  } catch (e) {
    checks.push({
      id: "api",
      label: "API / Database",
      status: "error",
      detail: e instanceof Error ? e.message : "Database unreachable",
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  checks.push({
    id: "stripe",
    label: "Stripe",
    status: stripeKey ? "ok" : "degraded",
    detail: stripeKey ? "Secret key configured" : "STRIPE_SECRET_KEY missing",
    probeEndpoint: "TODO: GET /api/admin/health/stripe-webhooks",
  });

  checks.push({
    id: "stripe_webhooks",
    label: "Stripe webhooks",
    status: "unknown",
    detail: "TODO: Track last successful webhook in StripeWebhookEvent table",
    probeEndpoint: "TODO: GET /api/admin/health/stripe-webhooks",
  });

  const ivsRegion = process.env.AWS_IVS_REGION ?? process.env.AWS_REGION;
  checks.push({
    id: "ivs",
    label: "Amazon IVS",
    status: ivsRegion ? "ok" : "degraded",
    detail: ivsRegion ? `Region ${ivsRegion}` : "AWS IVS region not configured",
    probeEndpoint: "TODO: GET /api/admin/health/ivs",
  });

  const shippoKey = process.env.SHIPPO_API_KEY;
  checks.push({
    id: "shippo",
    label: "Shippo",
    status: shippoKey ? "ok" : "degraded",
    detail: shippoKey ? "API key configured" : "SHIPPO_API_KEY missing",
    probeEndpoint: "TODO: GET /api/admin/health/shippo",
  });

  // Live stream health snapshot from DB.
  const unhealthyStreams = await prisma.liveRoom.count({
    where: {
      status: "live",
      OR: [{ streamHealth: "error" }, { lastIvsError: { not: null } }],
    },
  });
  checks.push({
    id: "live_streams",
    label: "Live stream sessions",
    status: unhealthyStreams > 0 ? "degraded" : "ok",
    detail:
      unhealthyStreams > 0
        ? `${unhealthyStreams} live room(s) reporting stream errors`
        : "No live rooms with stream errors",
  });

  checks.push({
    id: "failed_jobs",
    label: "Failed jobs / logs",
    status: "unknown",
    detail: "TODO: Wire cron failure table or external log drain (Netlify functions / Vercel)",
    probeEndpoint: "TODO: GET /api/admin/health/jobs",
  });

  const overall =
    checks.some((c) => c.status === "error")
      ? "error"
      : checks.some((c) => c.status === "degraded" || c.status === "unknown")
        ? "degraded"
        : "ok";

  return NextResponse.json({ overall, checks, updatedAt: new Date().toISOString() });
}
