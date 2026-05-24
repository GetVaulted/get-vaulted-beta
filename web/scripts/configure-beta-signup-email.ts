/**
 * Configure beta signup email on Netlify + Supabase Auth redirect URLs.
 *
 * Requires:
 *   RESEND_API_KEY — Resend API key (server-only)
 * Optional:
 *   RESEND_FROM — e.g. "Get Vaulted <onboarding@resend.dev>" or verified domain sender
 *   CONFIRM_BETA_SIGNUP_EMAIL=1
 *
 * Usage (from web/):
 *   CONFIRM_BETA_SIGNUP_EMAIL=1 RESEND_API_KEY=re_... npm run configure:beta-signup-email
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const webRoot = path.join(__dirname, "..");
const configPath = path.join(repoRoot, "supabase", "config.toml");

require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

const BETA_SITE = "https://beta.shopgetvaulted.com";
const BETA_REF = "xkaaicokjgmpbctfermj";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function runSupabaseConfigPush() {
  const cmd = `npx supabase --workdir "${repoRoot}" config push --project-ref ${BETA_REF} --yes`;
  const r = spawnSync(cmd, { cwd: repoRoot, shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("supabase config push failed");
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

function pushSupabaseAuthUrls() {
  const original = fs.readFileSync(configPath, "utf8");
  const redirectUrls = [
    BETA_SITE,
    `${BETA_SITE}/signin`,
    `${BETA_SITE}/join`,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ];
  let patched = original.replace(/^site_url\s*=\s*".*"$/m, `site_url = "${BETA_SITE}"`);
  patched = patched.replace(
    /^additional_redirect_urls\s*=\s*\[[^\]]*\]/m,
    `additional_redirect_urls = [${redirectUrls.map((u) => `"${u}"`).join(", ")}]`,
  );
  fs.writeFileSync(configPath, patched, "utf8");
  try {
    log("  supabase config push (beta auth URLs) …");
    runSupabaseConfigPush();
  } finally {
    fs.writeFileSync(configPath, original, "utf8");
    log("  restored local supabase/config.toml");
  }
}

async function main() {
  if (process.env.CONFIRM_BETA_SIGNUP_EMAIL !== "1") {
    console.error("Refusing: set CONFIRM_BETA_SIGNUP_EMAIL=1");
    process.exit(1);
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    console.error("Missing RESEND_API_KEY. Create one at https://resend.com/api-keys");
    process.exit(1);
  }

  log("\n=== Configure beta signup email ===\n");

  log("1) Netlify (get-vaulted-beta) env …");
  setNetlifyEnv("RESEND_API_KEY", resendKey);
  const from =
    process.env.RESEND_FROM?.trim() || "Get Vaulted <onboarding@resend.dev>";
  setNetlifyEnv("RESEND_FROM", from);
  setNetlifyEnv("NEXTAUTH_URL", BETA_SITE);

  log("\n2) Supabase Auth site + redirect URLs …");
  pushSupabaseAuthUrls();

  log("\n3) Verify after Netlify redeploy …");
  log(`   curl ${BETA_SITE}/api/auth/config`);
  log("   Expect: webSignupResendConfigured=true, webSignupVerificationMethod=resend_code");
  log("\nRedeploy beta on Netlify for RESEND env to take effect.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
