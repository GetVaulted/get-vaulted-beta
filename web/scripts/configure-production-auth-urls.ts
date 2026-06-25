/**
 * Push Supabase Auth site URL + redirect allowlist for production (xkaaicokjgmpbctfermj).
 * Keeps beta + localhost redirects so existing builds keep working during cutover.
 *
 * Usage: CONFIRM_PRODUCTION_AUTH_URLS=1 npm run configure:production-auth-urls
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPABASE_OAUTH_REDIRECT_ALLOWLIST } from "../src/lib/supabase-oauth-redirect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const configPath = path.join(repoRoot, "supabase", "config.toml");

const PRODUCTION_SITE = "https://shopgetvaulted.com";
const BETA_SITE = "https://beta.shopgetvaulted.com";
const PROJECT_REF = "xkaaicokjgmpbctfermj";

function runSupabaseConfigPush() {
  const cmd = `npx supabase --workdir "${repoRoot}" config push --project-ref ${PROJECT_REF} --yes`;
  const r = spawnSync(cmd, { cwd: repoRoot, shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("supabase config push failed");
}

function main() {
  if (process.env.CONFIRM_PRODUCTION_AUTH_URLS !== "1") {
    console.error("Refusing: set CONFIRM_PRODUCTION_AUTH_URLS=1");
    process.exit(1);
  }

  const redirectUrls = [
    PRODUCTION_SITE,
    `${PRODUCTION_SITE}/**`,
    `${PRODUCTION_SITE}/signin`,
    `${PRODUCTION_SITE}/join`,
    BETA_SITE,
    `${BETA_SITE}/**`,
    `${BETA_SITE}/signin`,
    `${BETA_SITE}/join`,
    ...SUPABASE_OAUTH_REDIRECT_ALLOWLIST,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000/**",
    "http://localhost:3000/**",
  ];

  const uniqueRedirectUrls = [...new Set(redirectUrls)];

  const original = fs.readFileSync(configPath, "utf8");
  let patched = original.replace(/^site_url\s*=\s*".*"$/m, `site_url = "${PRODUCTION_SITE}"`);
  patched = patched.replace(
    /^additional_redirect_urls\s*=\s*\[[^\]]*\]/m,
    `additional_redirect_urls = [${uniqueRedirectUrls.map((u) => `"${u}"`).join(", ")}]`,
  );

  fs.writeFileSync(configPath, patched, "utf8");
  try {
    console.log(`Pushing Supabase Auth URLs to ${PROJECT_REF} …`);
    runSupabaseConfigPush();
    console.log("Done. Site URL:", PRODUCTION_SITE);
    console.log("Redirect URLs:", uniqueRedirectUrls.length);
  } finally {
    fs.writeFileSync(configPath, original, "utf8");
    console.log("Restored local supabase/config.toml");
  }
}

main();
