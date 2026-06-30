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

async function main() {
  const host = parseHostArg();
  console.log(`=== Production deployment check ===\nHost: ${host}\n`);
  await checkHomepage(host);
  console.log("");
  await checkAuthConfig(host);

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
