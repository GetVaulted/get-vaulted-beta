/**
 * Set production launch env on Netlify (Stripe live + Resend).
 * Does not change Supabase or OAuth settings.
 *
 * Required env (from Stripe Dashboard → live mode):
 *   STRIPE_SECRET_KEY=sk_live_...
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...  (from live webhook endpoint)
 *
 * Required env (from Resend):
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM="Get Vaulted <hello@shopgetvaulted.com>"  (verified domain)
 *
 * Usage (from web/):
 *   CONFIRM_PROD_LAUNCH=1 STRIPE_SECRET_KEY=sk_live_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... \
 *     STRIPE_WEBHOOK_SECRET=whsec_... RESEND_API_KEY=re_... RESEND_FROM="Get Vaulted <hello@shopgetvaulted.com>" \
 *     npm run configure:prod-launch-env
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripeKeyMode } from "../src/lib/stripe-key-mode";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const webRoot = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

const PROD_SITE = "https://shopgetvaulted.com";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function runNetlify(args: string[]) {
  const cmd = `netlify ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
  const r = spawnSync(cmd, { cwd: repoRoot, shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`netlify ${args[0]} failed`);
}

function setNetlifyEnv(key: string, value: string) {
  log(`  netlify env:set ${key} (production)`);
  runNetlify(["env:set", key, value, "--context", "production"]);
}

function requireLiveStripeKeys(): {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
} {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (!secretKey || stripeKeyMode(secretKey) !== "live") {
    console.error("STRIPE_SECRET_KEY must be a live secret key (sk_live_...).");
    process.exit(1);
  }
  if (!publishableKey || stripeKeyMode(publishableKey) !== "live") {
    console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live publishable key (pk_live_...).");
    process.exit(1);
  }
  if (stripeKeyMode(secretKey) !== stripeKeyMode(publishableKey)) {
    console.error("Stripe secret and publishable keys must both be live mode.");
    process.exit(1);
  }
  if (!webhookSecret.startsWith("whsec_")) {
    console.error("STRIPE_WEBHOOK_SECRET must be the signing secret from your live Stripe webhook endpoint.");
    process.exit(1);
  }
  return { secretKey, publishableKey, webhookSecret };
}

function requireResendConfig(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.RESEND_FROM?.trim() ?? "";
  if (!apiKey.startsWith("re_")) {
    console.error("RESEND_API_KEY must be set (re_...).");
    process.exit(1);
  }
  if (!from.includes("@")) {
    console.error('RESEND_FROM must be a verified sender, e.g. "Get Vaulted <hello@shopgetvaulted.com>".');
    process.exit(1);
  }
  return { apiKey, from };
}

async function main() {
  if (process.env.CONFIRM_PROD_LAUNCH !== "1") {
    console.error("Refusing: set CONFIRM_PROD_LAUNCH=1");
    process.exit(1);
  }

  const stripe = requireLiveStripeKeys();
  const resend = requireResendConfig();

  log("\n=== Configure production launch env (Netlify) ===\n");
  log(`Target site URL: ${PROD_SITE}`);
  log("Supabase / OAuth: unchanged (same project ref as beta/mobile).\n");

  log("1) Stripe (live mode) …");
  setNetlifyEnv("STRIPE_SECRET_KEY", stripe.secretKey);
  setNetlifyEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", stripe.publishableKey);
  setNetlifyEnv("STRIPE_WEBHOOK_SECRET", stripe.webhookSecret);
  setNetlifyEnv("STRIPE_CONNECT_PUBLIC_APP_URL", PROD_SITE);

  log("\n2) Resend (signup resend + OTP fallback) …");
  setNetlifyEnv("RESEND_API_KEY", resend.apiKey);
  setNetlifyEnv("RESEND_FROM", resend.from);

  log("\n3) Public URLs (confirm unchanged) …");
  setNetlifyEnv("NEXTAUTH_URL", PROD_SITE);
  setNetlifyEnv("NEXT_PUBLIC_SITE_URL", PROD_SITE);

  log("\nDone. Trigger a production deploy, then run:");
  log(`  npm run check:production-deployment -- --host ${PROD_SITE}`);
  log("\nManual Stripe Dashboard steps:");
  log(`  - Live webhook endpoint: ${PROD_SITE}/api/stripe/webhook`);
  log("  - Enable Stripe Tax + TX registration if collecting sales tax");
  log("  - Connect return URLs use STRIPE_CONNECT_PUBLIC_APP_URL");
  log("\nManual Resend steps:");
  log("  - Verify shopgetvaulted.com domain and use RESEND_FROM from that domain");
  log("\nNote: Primary web signup uses Supabase Auth email (same project as beta).");
  log("Resend powers /api/auth/resend-verification and non-Supabase signup paths.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
