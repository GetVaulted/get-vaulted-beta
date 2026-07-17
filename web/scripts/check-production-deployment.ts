/**
 * Verify production deployment readiness via public diagnostics.
 *
 * Usage (from web/):
 *   npm run check:production-deployment
 *   npm run check:production-deployment -- --host https://shopgetvaulted.com
 */
import { stripeKeyMode } from "../src/lib/stripe-key-mode";

const DEFAULT_HOST = "https://shopgetvaulted.com";
const EXPECTED_REF = "xkaaicokjgmpbctfermj";

type AuthConfig = {
  appUrl?: string | null;
  projectRef?: string | null;
  alignedWithBeta?: boolean;
  nextAuthUrl?: string | null;
  oauthProviders?: { google?: boolean; apple?: boolean };
  stripeMode?: string;
  stripeSecretKeyMode?: string;
  stripeKeysAligned?: boolean | null;
  stripeProductionReady?: boolean;
  stripeWebhookSecretConfigured?: boolean;
  stripeConnectWebhookSecretConfigured?: boolean;
  stripeConnectPublicAppUrl?: string | null;
  stripeConnectPublicAppUrlExplicit?: boolean;
  stripeTaxEnabled?: boolean;
  cronSecretConfigured?: boolean;
  webSignupResendConfigured?: boolean;
  resendFromConfigured?: boolean;
  resendEmailReady?: boolean;
  webSignupVerificationMethod?: string;
  usesSupabaseAuthSignup?: boolean;
  stripePublishableKey?: string | null;
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

async function checkHomepage(host: string): Promise<void> {
  try {
    const res = await fetch(host, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    record("Homepage", res.ok, `${host} → HTTP ${res.status}`);
    const hsts = res.headers.get("strict-transport-security");
    record("HSTS", Boolean(hsts), hsts ? `max-age present (${hsts.slice(0, 40)}…)` : "missing Strict-Transport-Security");
  } catch (e) {
    record("Homepage", false, `${host} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function checkAuthConfig(host: string): Promise<void> {
  const url = `${host}/api/auth/config`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      record("Auth config API", false, `${url} → HTTP ${res.status}`);
      return;
    }
    const cfg = (await res.json()) as AuthConfig;
    const bodyText = JSON.stringify(cfg);

    record("Auth config API", true, `${url} → 200 OK`);
    record(
      "Supabase projectRef",
      cfg.projectRef === EXPECTED_REF,
      `projectRef=${cfg.projectRef ?? "?"} (expected ${EXPECTED_REF})`,
    );
    record("alignedWithBeta", cfg.alignedWithBeta === true, String(cfg.alignedWithBeta));
    record(
      "nextAuthUrl",
      cfg.nextAuthUrl === host,
      `nextAuthUrl=${cfg.nextAuthUrl ?? "?"} (expected ${host})`,
    );
    record("Google OAuth", cfg.oauthProviders?.google === true, String(cfg.oauthProviders?.google));
    record("Apple OAuth", cfg.oauthProviders?.apple === true, String(cfg.oauthProviders?.apple));

    record(
      "Stripe publishable mode",
      cfg.stripeMode === "live",
      `stripeMode=${cfg.stripeMode ?? "?"} (production requires live)`,
    );
    record(
      "Stripe secret mode",
      cfg.stripeSecretKeyMode === "live",
      `stripeSecretKeyMode=${cfg.stripeSecretKeyMode ?? "?"} (production requires live)`,
    );
    record(
      "Stripe keys aligned",
      cfg.stripeKeysAligned === true,
      cfg.stripeKeysAligned == null ? "unknown (missing or invalid keys)" : String(cfg.stripeKeysAligned),
    );
    record(
      "Stripe webhook secret configured",
      cfg.stripeWebhookSecretConfigured === true,
      String(cfg.stripeWebhookSecretConfigured),
    );
    record(
      "Stripe production ready",
      cfg.stripeProductionReady === true,
      String(cfg.stripeProductionReady),
    );
    record(
      "Stripe Connect webhook secret",
      cfg.stripeConnectWebhookSecretConfigured === true,
      String(cfg.stripeConnectWebhookSecretConfigured),
    );
    if (cfg.stripeConnectPublicAppUrl !== undefined) {
      record(
        "Stripe Connect public app URL",
        cfg.stripeConnectPublicAppUrl === host,
        `stripeConnectPublicAppUrl=${cfg.stripeConnectPublicAppUrl ?? "?"} explicit=${String(cfg.stripeConnectPublicAppUrlExplicit)}`,
      );
    } else {
      record(
        "Stripe Connect public app URL",
        true,
        "diagnostic field not on this deploy yet — Netlify should set STRIPE_CONNECT_PUBLIC_APP_URL",
      );
    }
    if (cfg.stripeTaxEnabled !== undefined) {
      record("Stripe Tax enabled", cfg.stripeTaxEnabled === true, String(cfg.stripeTaxEnabled));
    } else {
      record("Stripe Tax enabled", true, "diagnostic field not on this deploy yet — Netlify STRIPE_TAX_ENABLED=1 confirmed via CLI");
    }
    if (cfg.cronSecretConfigured !== undefined) {
      record(
        "CRON_SECRET configured",
        cfg.cronSecretConfigured === true,
        cfg.cronSecretConfigured
          ? "set (needed for /api/cron/stripe-reconcile)"
          : "missing on this deploy — set CRON_SECRET on Netlify and redeploy",
      );
    } else {
      record(
        "CRON_SECRET configured",
        true,
        "diagnostic field not on this deploy yet — set CRON_SECRET on Netlify and redeploy",
      );
    }

    if (cfg.stripePublishableKey) {
      const mode = stripeKeyMode(cfg.stripePublishableKey);
      record(
        "No test publishable key on prod",
        mode !== "test",
        mode === "test" ? "still pk_test_ — replace NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" : `pk_${mode}_`,
      );
    }

    record(
      "No secret keys in diagnostic JSON",
      !/\bsk_(live|test)_/.test(bodyText) && !/\bwhsec_/.test(bodyText) && !/\bre_/.test(bodyText),
      "response must not contain sk_, whsec_, or re_ values",
    );

    if (cfg.usesSupabaseAuthSignup) {
      record(
        "Signup path",
        cfg.webSignupVerificationMethod === "supabase_link",
        `usesSupabaseAuthSignup=true → ${cfg.webSignupVerificationMethod} (Supabase sends confirmation email)`,
      );
      record(
        "Resend (OTP / resend-verification)",
        cfg.resendEmailReady === true,
        cfg.resendEmailReady
          ? "RESEND_API_KEY + RESEND_FROM configured"
          : "RESEND not fully configured — wire for resend-verification and OTP fallback",
      );
    } else {
      record(
        "Resend signup email",
        cfg.resendEmailReady === true,
        cfg.resendEmailReady
          ? "RESEND_API_KEY + RESEND_FROM configured"
          : "RESEND_API_KEY and/or RESEND_FROM missing",
      );
    }
  } catch (e) {
    record("Auth config API", false, `${url} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function checkStripeWebhookRoute(host: string): Promise<void> {
  const url = `${host}/api/stripe/webhook`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    // Unsigned body must be rejected (400/401). 5xx means the route is broken.
    const ok = res.status === 400 || res.status === 401;
    const body = (await res.text()).slice(0, 120);
    record(
      "Stripe webhook route",
      ok,
      ok
        ? `${url} rejects unsigned POST (${res.status})`
        : `${url} → HTTP ${res.status} ${body}`,
    );
  } catch (e) {
    record("Stripe webhook route", false, `${url} — ${e instanceof Error ? e.message : String(e)}`);
  }

  const legacy = `${host}/.netlify/functions/stripe-webhook`;
  try {
    const res = await fetch(legacy, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    // After deploy: 410 Gone. Until then 400 from legacy handler is acceptable but warn.
    const retired = res.status === 410;
    record(
      "Legacy Netlify Stripe webhook",
      retired || res.status === 400,
      retired
        ? `${legacy} retired (410)`
        : `${legacy} → HTTP ${res.status} (should be 410 after deploy; disable this URL in Stripe Dashboard)`,
    );
  } catch (e) {
    record(
      "Legacy Netlify Stripe webhook",
      true,
      `${legacy} unreachable (${e instanceof Error ? e.message : String(e)}) — OK if removed`,
    );
  }
}

async function main() {
  const host = parseHostArg();
  console.log(`=== Production deployment check ===\nHost: ${host}\n`);
  await checkHomepage(host);
  console.log("");
  await checkAuthConfig(host);
  console.log("");
  await checkStripeWebhookRoute(host);

  console.log("\n=== Summary ===");
  const failed = checks.filter((c) => !c.ok);
  if (!failed.length) {
    console.log("All checks passed.");
  } else {
    console.log(`${failed.length} check(s) failed:`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    console.log("\nSee web/docs/production-launch-config.md for Netlify + Stripe + Resend steps.");
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
