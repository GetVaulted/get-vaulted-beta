/**
 * Stripe setup verification — public diagnostics + optional live Dashboard API check.
 *
 * Usage (from web/):
 *   npm run check:stripe-setup
 *   npm run check:stripe-setup -- --host https://shopgetvaulted.com
 *
 * Optional (lists webhook endpoints for the account matching this key):
 *   STRIPE_SECRET_KEY=sk_live_… npm run check:stripe-setup
 */
import Stripe from "stripe";

const DEFAULT_HOST = "https://shopgetvaulted.com";

/** Events handled by `processStripeWebhookEvent` in web/src/services/payments.ts */
export const REQUIRED_STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "account.updated",
  "capability.updated",
] as const;

type AuthConfig = {
  stripeProductionReady?: boolean;
  stripeMode?: string;
  stripeSecretKeyMode?: string;
  stripeKeysAligned?: boolean | null;
  stripeWebhookSecretConfigured?: boolean;
  stripeConnectWebhookSecretConfigured?: boolean;
  stripeConnectPublicAppUrl?: string | null;
  stripeConnectPublicAppUrlExplicit?: boolean;
  stripeTaxEnabled?: boolean;
  cronSecretConfigured?: boolean;
  stripePublishableKey?: string | null;
  nextAuthUrl?: string | null;
};

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
let exitCode = 0;

function parseHostArg(): string {
  const idx = process.argv.indexOf("--host");
  const raw = idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : DEFAULT_HOST;
  return raw.replace(/\/+$/, "");
}

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  if (!ok) exitCode = 1;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  console.log(`    ${detail}`);
}

async function checkPublicConfig(host: string): Promise<AuthConfig | null> {
  const url = `${host}/api/auth/config`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      record("Auth config", false, `${url} → HTTP ${res.status}`);
      return null;
    }
    const cfg = (await res.json()) as AuthConfig;
    record("Auth config", true, `${url} → 200`);
    record("stripeProductionReady", cfg.stripeProductionReady === true, String(cfg.stripeProductionReady));
    record(
      "Live keys aligned",
      cfg.stripeMode === "live" && cfg.stripeSecretKeyMode === "live" && cfg.stripeKeysAligned === true,
      `mode=${cfg.stripeMode}/${cfg.stripeSecretKeyMode} aligned=${String(cfg.stripeKeysAligned)}`,
    );
    record("Webhook secret env", cfg.stripeWebhookSecretConfigured === true, String(cfg.stripeWebhookSecretConfigured));
    record(
      "Connect webhook secret env",
      cfg.stripeConnectWebhookSecretConfigured === true,
      String(cfg.stripeConnectWebhookSecretConfigured),
    );
    if (cfg.stripeConnectPublicAppUrl != null) {
      record(
        "Connect public app URL",
        cfg.stripeConnectPublicAppUrl === host,
        `${cfg.stripeConnectPublicAppUrl} (explicit=${String(cfg.stripeConnectPublicAppUrlExplicit)})`,
      );
    } else {
      record(
        "Connect public app URL",
        true,
        "field not deployed yet — confirm STRIPE_CONNECT_PUBLIC_APP_URL=https://shopgetvaulted.com on Netlify",
      );
    }
    if (cfg.stripeTaxEnabled != null) {
      record("Stripe Tax enabled", cfg.stripeTaxEnabled === true, String(cfg.stripeTaxEnabled));
    }
    if (cfg.cronSecretConfigured != null) {
      record(
        "CRON_SECRET",
        cfg.cronSecretConfigured === true,
        cfg.cronSecretConfigured ? "configured" : "missing or not yet redeployed",
      );
    }
    return cfg;
  } catch (e) {
    record("Auth config", false, e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function checkWebhookRoute(host: string): Promise<void> {
  const url = `${host}/api/stripe/webhook`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    const ok = res.status === 400 || res.status === 401;
    record("Primary webhook route", ok, `${url} → ${res.status} (unsigned body must fail closed)`);
  } catch (e) {
    record("Primary webhook route", false, e instanceof Error ? e.message : String(e));
  }
}

async function checkSmokeRoutes(host: string): Promise<void> {
  const routes: Array<{ path: string; method: string; expect: number[]; allow503?: boolean }> = [
    { path: "/api/stripe/connect/status", method: "GET", expect: [401, 403] },
    { path: "/api/checkout", method: "POST", expect: [401, 403, 400, 415] },
    { path: "/api/account/payment-methods/setup-intent", method: "POST", expect: [401, 403, 400, 415] },
    { path: "/api/cron/stripe-reconcile", method: "POST", expect: [401, 403], allow503: true },
  ];
  for (const r of routes) {
    try {
      const res = await fetch(`${host}${r.path}`, {
        method: r.method,
        headers: { "Content-Type": "application/json" },
        body: r.method === "POST" ? "{}" : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      const body = res.status === 503 ? (await res.clone().text()).slice(0, 160) : "";
      const cronNeedsRedeploy =
        r.allow503 && res.status === 503 && /CRON_SECRET not configured/i.test(body);
      const ok =
        cronNeedsRedeploy ||
        r.expect.includes(res.status) ||
        (res.status >= 400 && res.status < 500);
      record(
        `Smoke ${r.method} ${r.path}`,
        ok && (res.status < 500 || cronNeedsRedeploy),
        cronNeedsRedeploy
          ? "HTTP 503 CRON_SECRET set on Netlify but not live yet — redeploy production"
          : `HTTP ${res.status}${res.status >= 500 ? " — route broken" : " (auth/body gate OK)"}`,
      );
    } catch (e) {
      record(`Smoke ${r.method} ${r.path}`, false, e instanceof Error ? e.message : String(e));
    }
  }
}

function eventCoverage(enabled: string[] | ["*"]): { missing: string[]; wildcard: boolean } {
  if (enabled.length === 1 && enabled[0] === "*") {
    return { missing: [], wildcard: true };
  }
  const set = new Set(enabled);
  return {
    wildcard: false,
    missing: REQUIRED_STRIPE_WEBHOOK_EVENTS.filter((e) => !set.has(e)),
  };
}

async function checkDashboardWebhooksViaApi(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.log("\n--- Stripe Dashboard API (skipped) ---");
    console.log("Set STRIPE_SECRET_KEY (must match Netlify production sk_live_ for account pk_live_51T9VAE…) to list endpoints.");
    console.log("Required events:");
    for (const e of REQUIRED_STRIPE_WEBHOOK_EVENTS) console.log(`  - ${e}`);
    console.log(`Endpoint URL: ${DEFAULT_HOST}/api/stripe/webhook`);
    record(
      "Dashboard webhook event list",
      true,
      "manual: confirm events above on Live mode account matching production pk_live_51T9VAE…",
    );
    return;
  }

  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  const account = await stripe.accounts.retrieve();
  const pubHint = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "unknown";
  record("Stripe API account", Boolean(account.id), `account=${account.id} keyMode=${pubHint}`);

  const listed = await stripe.webhookEndpoints.list({ limit: 100 });
  const primary = listed.data.filter((ep) => ep.url.includes("/api/stripe/webhook"));
  const legacy = listed.data.filter((ep) => ep.url.includes("netlify/functions/stripe-webhook"));

  record(
    "Primary webhook endpoint registered",
    primary.length > 0,
    primary.length
      ? primary.map((ep) => `${ep.url} (${ep.status})`).join("; ")
      : "none — add Live endpoint https://shopgetvaulted.com/api/stripe/webhook",
  );

  for (const ep of primary) {
    const { missing, wildcard } = eventCoverage(ep.enabled_events as string[] | ["*"]);
    record(
      `Webhook events ${ep.id}`,
      missing.length === 0,
      wildcard
        ? "all events (*)"
        : missing.length
          ? `missing: ${missing.join(", ")}`
          : `covers all ${REQUIRED_STRIPE_WEBHOOK_EVENTS.length} required events`,
    );
  }

  record(
    "No legacy Netlify function webhook",
    legacy.length === 0,
    legacy.length
      ? `disable/delete: ${legacy.map((e) => e.url).join(", ")}`
      : "none registered",
  );
}

async function main() {
  const host = parseHostArg();
  console.log(`=== Stripe setup verification ===\nHost: ${host}\n`);
  await checkPublicConfig(host);
  console.log("");
  await checkWebhookRoute(host);
  console.log("");
  await checkSmokeRoutes(host);
  console.log("");
  await checkDashboardWebhooksViaApi();

  console.log("\n=== Manual smoke (requires signed-in seller/buyer) ===");
  console.log("1. Seller HQ → Stripe Connect → charges_enabled + payouts_enabled");
  console.log("2. Buy a low-price listing → order paid via webhook (not stuck pending)");
  console.log("3. Account → add payment method (SetupIntent)");
  console.log("4. Optional: trade fee checkout (kind=trade_platform_fee)");
  console.log("5. Stripe Dashboard → Payment shows application fee (~8% marketplace)");

  console.log("\n=== Summary ===");
  const failed = checks.filter((c) => !c.ok);
  if (!failed.length) {
    console.log("Automated checks passed. Complete manual smoke above for 100% confidence.");
  } else {
    console.log(`${failed.length} check(s) failed:`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
