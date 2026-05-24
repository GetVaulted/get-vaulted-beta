/**
 * Push Supabase Auth site URL + redirect allowlist for beta (xkaaicokjgmpbctfermj).
 * Does not touch Netlify or Resend. Safe to run without RESEND_API_KEY.
 *
 * Usage: CONFIRM_BETA_AUTH_URLS=1 npm run configure:beta-auth-urls
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const configPath = path.join(repoRoot, "supabase", "config.toml");

const BETA_SITE = "https://beta.shopgetvaulted.com";
const BETA_REF = "xkaaicokjgmpbctfermj";

function runSupabaseConfigPush() {
  const cmd = `npx supabase --workdir "${repoRoot}" config push --project-ref ${BETA_REF} --yes`;
  const r = spawnSync(cmd, { cwd: repoRoot, shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("supabase config push failed");
}

function main() {
  if (process.env.CONFIRM_BETA_AUTH_URLS !== "1") {
    console.error("Refusing: set CONFIRM_BETA_AUTH_URLS=1");
    process.exit(1);
  }

  const redirectUrls = [
    BETA_SITE,
    `${BETA_SITE}/signin`,
    `${BETA_SITE}/join`,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ];

  const original = fs.readFileSync(configPath, "utf8");
  let patched = original.replace(/^site_url\s*=\s*".*"$/m, `site_url = "${BETA_SITE}"`);
  patched = patched.replace(
    /^additional_redirect_urls\s*=\s*\[[^\]]*\]/m,
    `additional_redirect_urls = [${redirectUrls.map((u) => `"${u}"`).join(", ")}]`,
  );

  fs.writeFileSync(configPath, patched, "utf8");
  try {
    console.log(`Pushing Supabase Auth URLs to ${BETA_REF} …`);
    runSupabaseConfigPush();
    console.log("Done. Site URL:", BETA_SITE);
  } finally {
    fs.writeFileSync(configPath, original, "utf8");
    console.log("Restored local supabase/config.toml");
  }
}

main();
