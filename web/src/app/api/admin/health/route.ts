import { NextResponse } from "next/server";
import {
  deriveAdminHealthOverall,
  recentIssuesFromChecks,
  type AdminHealthCheck,
} from "@/lib/admin/admin-platform-health";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  parseDatabaseConnectionInfo,
  resolveDatabaseUrl,
} from "@/lib/resolve-database-url";

const FANOUT_WARN = 50;
const FANOUT_ERROR = 500;
const WEBHOOK_FAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_STALE_MS = 48 * 60 * 60 * 1000;

function dbErrorHint(message: string): { issue: string; solution: string } {
  const lower = message.toLowerCase();
  if (lower.includes("max clients") || lower.includes("emaxconnsession") || lower.includes("too many connections")) {
    return {
      issue: "The database connection pool is saturated.",
      solution:
        "Confirm Netlify DATABASE_URL uses the Supabase transaction pooler (port 6543) with pgbouncer=true&connection_limit=1. Check Supabase pooler wait time and reduce concurrent API load if needed.",
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      issue: "The database did not respond in time.",
      solution: "Check Supabase project status and Netlify ↔ DB region colocation. Retry in a minute; if it persists, inspect Supabase compute and pooler.",
    };
  }
  return {
    issue: "The API cannot reach Postgres.",
    solution: "Verify DATABASE_URL on Netlify (transaction pooler) and that the Supabase project is healthy.",
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const checks: AdminHealthCheck[] = [];
  const now = new Date();
  const updatedAt = now.toISOString();

  // --- Supabase (env) ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (supabaseUrl) {
    checks.push({
      id: "supabase",
      label: "Supabase",
      status: "ok",
      detail: "URL configured",
      issue: null,
      solution: null,
      log: null,
      href: null,
    });
  } else {
    checks.push({
      id: "supabase",
      label: "Supabase",
      status: "error",
      detail: "Missing SUPABASE_URL",
      issue: "Supabase URL is not configured on this deploy.",
      solution: "Set NEXT_PUBLIC_SUPABASE_URL (and SUPABASE_URL) on Netlify production to your project HTTPS URL.",
      log: "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL",
      href: null,
    });
  }

  // --- API / Database (host/port only — never password) ---
  let dbHostDetail = "DATABASE_URL not readable";
  let dbPoolerOk: boolean | null = null;
  try {
    const info = parseDatabaseConnectionInfo(resolveDatabaseUrl());
    const hostPort = `${info.host}:${info.port}`;
    const isPooler = info.host.includes("pooler.supabase.com");
    const isDirect = info.host.startsWith("db.") && info.host.endsWith(".supabase.co");
    dbPoolerOk = isPooler && (info.port === "6543" || info.port === "5432");
    dbHostDetail = isDirect
      ? `${hostPort} (direct — use transaction pooler :6543 on Netlify)`
      : isPooler
        ? `${hostPort} (${info.port === "6543" ? "transaction pooler" : info.port === "5432" ? "session pooler → app rewrites to 6543" : "pooler"})`
        : hostPort;
  } catch (e) {
    dbHostDetail = e instanceof Error ? e.message.slice(0, 120) : "Could not parse DATABASE_URL";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      id: "api",
      label: "API / Database",
      status: dbPoolerOk === false ? "degraded" : "ok",
      detail: `Prisma connected · ${dbHostDetail}`,
      issue: dbPoolerOk === false ? "DATABASE_URL is not the Supabase transaction pooler." : null,
      solution:
        dbPoolerOk === false
          ? "In Supabase → Database → Connection string → Transaction (port 6543). Paste that URI into Netlify DATABASE_URL (Production) and redeploy."
          : null,
      log: dbHostDetail,
      href: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database unreachable";
    const hint = dbErrorHint(message);
    checks.push({
      id: "api",
      label: "API / Database",
      status: "error",
      detail: `${message.slice(0, 120)} · ${dbHostDetail}`,
      issue: hint.issue,
      solution: hint.solution,
      log: `${dbHostDetail} | ${message.slice(0, 200)}`,
      href: null,
    });
  }

  // --- Stripe key ---
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (stripeKey) {
    checks.push({
      id: "stripe",
      label: "Stripe",
      status: "ok",
      detail: "Secret key configured",
      issue: null,
      solution: null,
      log: null,
      href: null,
    });
  } else {
    checks.push({
      id: "stripe",
      label: "Stripe",
      status: "degraded",
      detail: "STRIPE_SECRET_KEY missing",
      issue: "Stripe secret key is not set — payments cannot run.",
      solution: "Set STRIPE_SECRET_KEY on Netlify (live or test key matching your Connect setup).",
      log: "Missing STRIPE_SECRET_KEY",
      href: null,
    });
  }

  // --- Stripe webhooks (DB freshness) ---
  try {
    const sinceFail = new Date(now.getTime() - WEBHOOK_FAIL_WINDOW_MS);
    const [failedRecent, lastOk, lastAny, unprocessedStale] = await Promise.all([
      prisma.webhookEventLog.count({
        where: {
          source: "stripe",
          error: { not: null },
          createdAt: { gte: sinceFail },
        },
      }),
      prisma.webhookEventLog.findFirst({
        where: { source: "stripe", processed: true, error: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, eventType: true, externalId: true },
      }),
      prisma.webhookEventLog.findFirst({
        where: { source: "stripe" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, eventType: true, error: true, processed: true },
      }),
      // Only count events that look like real Stripe deliveries still waiting to finish.
      // Signature rejects (eventType still "received", often empty payload) are final and must
      // not keep Health degraded forever.
      prisma.webhookEventLog.count({
        where: {
          source: "stripe",
          processed: false,
          createdAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) },
          NOT: {
            OR: [
              { error: { startsWith: "verify:" } },
              { AND: [{ eventType: "received" }, { externalId: null }] },
            ],
          },
        },
      }),
    ]);

    if (failedRecent > 0) {
      checks.push({
        id: "stripe_webhooks",
        label: "Stripe webhooks",
        status: "degraded",
        detail: `${failedRecent} failed Stripe webhook(s) in the last 24h`,
        issue: "Recent Stripe webhooks failed while processing.",
        solution:
          "Open Stripe Dashboard → Developers → Webhooks and confirm the endpoint returns 2xx. Check Netlify function logs for the Stripe webhook route and verify STRIPE_WEBHOOK_SECRET.",
        log: lastAny?.error ? lastAny.error.slice(0, 300) : `${failedRecent} failures`,
        href: null,
      });
    } else if (unprocessedStale > 0) {
      checks.push({
        id: "stripe_webhooks",
        label: "Stripe webhooks",
        status: "degraded",
        detail: `${unprocessedStale} Stripe webhook(s) still unprocessed after 10+ minutes`,
        issue: "Stripe webhooks are stuck unprocessed.",
        solution:
          "Inspect WebhookEventLog rows with processed=false. Fix the handler error, then let Stripe retry or replay events from the Stripe Dashboard.",
        log: `unprocessed_stale=${unprocessedStale}`,
        href: null,
      });
    } else if (!lastAny) {
      checks.push({
        id: "stripe_webhooks",
        label: "Stripe webhooks",
        status: "unknown",
        detail: "No Stripe webhook events logged yet",
        issue: "No Stripe webhooks have been recorded on this environment.",
        solution:
          "Confirm the Stripe webhook endpoint points at this site’s /api/stripe/webhook and that STRIPE_WEBHOOK_SECRET matches. Send a test event from Stripe if needed.",
        log: null,
        href: null,
      });
    } else if (lastOk && now.getTime() - lastOk.createdAt.getTime() > WEBHOOK_STALE_MS) {
      checks.push({
        id: "stripe_webhooks",
        label: "Stripe webhooks",
        status: "degraded",
        detail: `Last successful webhook ${lastOk.createdAt.toISOString()}`,
        issue: "No successful Stripe webhook in over 48 hours.",
        solution:
          "If you expect payment traffic, verify the webhook endpoint and secret. Quiet test environments can ignore this.",
        log: `${lastOk.eventType} ${lastOk.externalId ?? ""}`.trim(),
        href: null,
      });
    } else {
      const last = lastOk ?? lastAny;
      const eventType =
        last && "eventType" in last && typeof last.eventType === "string" ? last.eventType : "stripe";
      checks.push({
        id: "stripe_webhooks",
        label: "Stripe webhooks",
        status: "ok",
        detail: last ? `Last event ${last.createdAt.toISOString()} (${eventType})` : "Stripe webhooks healthy",
        issue: null,
        solution: null,
        log: null,
        href: null,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook log query failed";
    checks.push({
      id: "stripe_webhooks",
      label: "Stripe webhooks",
      status: "unknown",
      detail: message.slice(0, 200),
      issue: "Could not read Stripe webhook audit logs.",
      solution: "Ensure migrations are applied and WebhookEventLog is queryable.",
      log: message.slice(0, 300),
      href: null,
    });
  }

  // --- Amazon IVS env ---
  const ivsRegion =
    process.env.AWS_IVS_REGION?.trim() ||
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "";
  const ivsKey =
    process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  if (ivsRegion && ivsKey) {
    checks.push({
      id: "ivs",
      label: "Amazon IVS",
      status: "ok",
      detail: `Region ${ivsRegion}`,
      issue: null,
      solution: null,
      log: null,
      href: null,
    });
  } else {
    checks.push({
      id: "ivs",
      label: "Amazon IVS",
      status: "degraded",
      detail: ivsRegion ? "AWS credentials missing" : "AWS IVS region not configured",
      issue: "IVS streaming credentials or region are incomplete.",
      solution:
        "Set VAULTED_AWS_REGION (or AWS_REGION) and VAULTED_AWS_ACCESS_KEY_ID / VAULTED_AWS_SECRET_ACCESS_KEY on Netlify. Ensure IAM includes ivs:StartComposition for guest HLS.",
      log: `region=${ivsRegion || "missing"} key=${ivsKey ? "set" : "missing"}`,
      href: null,
    });
  }

  // --- Shippo (light) ---
  const shippoKey = process.env.SHIPPO_API_TOKEN?.trim();
  if (shippoKey) {
    checks.push({
      id: "shippo",
      label: "Shippo",
      status: "ok",
      detail: "API key configured",
      issue: null,
      solution: null,
      log: null,
      href: null,
    });
  } else {
    checks.push({
      id: "shippo",
      label: "Shippo",
      status: "degraded",
      detail: "SHIPPO_API_TOKEN missing",
      issue: "Shippo is not configured — label purchase may fail.",
      solution: "Set SHIPPO_API_TOKEN on Netlify if you need shipping labels.",
      log: "Missing SHIPPO_API_TOKEN",
      href: "/admin/shipping-profiles",
    });
  }

  // --- Live stream sessions ---
  try {
    const [errorRooms, missingComposition] = await Promise.all([
      prisma.liveRoom.findMany({
        where: {
          status: "live",
          OR: [{ streamHealth: "error" }, { lastIvsError: { not: null } }],
        },
        select: { id: true, title: true, streamHealth: true, lastIvsError: true, streamMode: true },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.liveRoom.findMany({
        where: {
          status: "live",
          streamMode: "stage_webrtc",
          streamPaused: { not: true },
          ivsStageArn: { not: null },
          OR: [{ ivsCompositionArn: null }, { ivsCompositionArn: "" }],
        },
        select: { id: true, title: true, lastIvsError: true },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    if (errorRooms.length > 0) {
      const titles = errorRooms.map((r) => r.title || r.id).join(", ");
      const firstLog = errorRooms.map((r) => r.lastIvsError).find(Boolean) ?? `streamHealth=${errorRooms[0]?.streamHealth}`;
      checks.push({
        id: "live_streams",
        label: "Live stream sessions",
        status: "degraded",
        detail: `${errorRooms.length} live room(s) reporting stream errors`,
        issue: `Live room(s) have stream errors: ${titles}`,
        solution:
          "Open Live Shows for the room. Check lastIvsError, host reconnect, and AWS IVS IAM (including StartComposition for guest share links).",
        log: String(firstLog).slice(0, 300),
        href: "/admin/live-shows",
      });
    } else if (missingComposition.length > 0) {
      const titles = missingComposition.map((r) => r.title || r.id).join(", ");
      // Best-effort heal while the dashboard is open — same path buyer polls use.
      for (const r of missingComposition) {
        void import("@/services/ivs")
          .then(({ ensureStageHlsCompositionActive }) => ensureStageHlsCompositionActive(r.id))
          .catch(() => {});
      }
      checks.push({
        id: "live_streams",
        label: "Live stream sessions",
        status: "degraded",
        detail: `${missingComposition.length} live WebRTC room(s) missing HLS composition`,
        issue: `Guest share-link video may fail — no Stage→HLS composition on: ${titles}`,
        solution:
          "Confirm LIVE_STAGE_COMPOSITION_ENABLED is not false, IAM allows ivs:StartComposition, and the host Go Live path provisions channel + composition. Ask guests to wait ~15s after go-live, then recheck Live Shows. Healing was triggered automatically — refresh this page in ~30s.",
        log: missingComposition[0]?.lastIvsError?.slice(0, 300) ?? "ivsCompositionArn=null",
        href: "/admin/live-shows",
      });
    } else {
      const liveCount = await prisma.liveRoom.count({ where: { status: "live" } });
      checks.push({
        id: "live_streams",
        label: "Live stream sessions",
        status: "ok",
        detail:
          liveCount > 0
            ? `${liveCount} live room(s) — no stream errors or missing composition`
            : "No live rooms right now",
        issue: null,
        solution: null,
        log: null,
        href: "/admin/live-shows",
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Live room query failed";
    checks.push({
      id: "live_streams",
      label: "Live stream sessions",
      status: "unknown",
      detail: message.slice(0, 200),
      issue: "Could not load live stream health from the database.",
      solution: "Confirm the database is reachable and LiveRoom columns (streamHealth, ivsCompositionArn) exist.",
      log: message.slice(0, 300),
      href: "/admin/live-shows",
    });
  }

  // --- Auction fanout backlog ---
  try {
    const backlog = await prisma.liveAuctionEvent.count({
      where: { publishedAt: null },
    });
    if (backlog >= FANOUT_ERROR) {
      checks.push({
        id: "auction_fanout",
        label: "Auction fanout",
        status: "error",
        detail: `${backlog} unpublished LiveAuctionEvent row(s)`,
        issue: "Realtime bid/chat fanout backlog is critically high — viewers may see stale auctions.",
        solution:
          "Run or restart the auction-fanout drain worker (npm run auction-fanout:drain). Check Supabase Realtime and Netlify function errors. Monitor until publishedAt backlog drops below 50.",
        log: `unpublished=${backlog} threshold=${FANOUT_ERROR}`,
        href: null,
      });
    } else if (backlog >= FANOUT_WARN) {
      checks.push({
        id: "auction_fanout",
        label: "Auction fanout",
        status: "degraded",
        detail: `${backlog} unpublished LiveAuctionEvent row(s)`,
        issue: "Realtime fanout backlog is elevated — bid UI may lag.",
        solution:
          "Ensure fanout flush is running on bid requests and consider a scheduled auction-fanout:drain worker. Watch LiveAuctionEvent where publishedAt IS NULL.",
        log: `unpublished=${backlog} warn=${FANOUT_WARN}`,
        href: null,
      });
    } else {
      checks.push({
        id: "auction_fanout",
        label: "Auction fanout",
        status: "ok",
        detail: backlog === 0 ? "No unpublished auction events" : `${backlog} unpublished (within normal range)`,
        issue: null,
        solution: null,
        log: null,
        href: null,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fanout query failed";
    checks.push({
      id: "auction_fanout",
      label: "Auction fanout",
      status: "unknown",
      detail: message.slice(0, 200),
      issue: "Could not measure auction fanout backlog.",
      solution: "Confirm LiveAuctionEvent table is migrated and queryable.",
      log: message.slice(0, 300),
      href: null,
    });
  }

  const overall = deriveAdminHealthOverall(checks);
  const recentIssues = recentIssuesFromChecks(checks, updatedAt);

  return NextResponse.json({ overall, checks, recentIssues, updatedAt });
}
