/**
 * Push Supabase Auth site URL + redirect allowlist for production (xkaaicokjgmpbctfermj).
 * Uses Management API PATCH so OAuth provider secrets in the dashboard are not overwritten.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... CONFIRM_PRODUCTION_AUTH_URLS=1 npm run configure:production-auth-urls
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SUPABASE_OAUTH_REDIRECT_ALLOWLIST } from "../src/lib/supabase-oauth-redirect";
import {
  buildUriAllowList,
  getSupabaseAuthConfig,
  patchSupabaseAuthConfig,
  requireSupabaseAccessToken,
} from "./lib/supabase-management-auth";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

const PRODUCTION_SITE = "https://shopgetvaulted.com";
const BETA_SITE = "https://beta.shopgetvaulted.com";
const PROJECT_REF = "xkaaicokjgmpbctfermj";

async function main() {
  if (process.env.CONFIRM_PRODUCTION_AUTH_URLS !== "1") {
    console.error("Refusing: set CONFIRM_PRODUCTION_AUTH_URLS=1");
    process.exit(1);
  }

  const token = requireSupabaseAccessToken();

  const redirectUrls = [
    PRODUCTION_SITE,
    `${PRODUCTION_SITE}/**`,
    `${PRODUCTION_SITE}/signin`,
    `${PRODUCTION_SITE}/join`,
    `${PRODUCTION_SITE}/reset-password`,
    `${PRODUCTION_SITE}/forgot-password`,
    BETA_SITE,
    `${BETA_SITE}/**`,
    `${BETA_SITE}/signin`,
    `${BETA_SITE}/join`,
    `${BETA_SITE}/reset-password`,
    `${BETA_SITE}/forgot-password`,
    ...SUPABASE_OAUTH_REDIRECT_ALLOWLIST,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000/**",
    "http://localhost:3000/**",
  ];

  const before = await getSupabaseAuthConfig(PROJECT_REF, token);
  console.log("Current site_url:", before.site_url ?? "(unset)");
  console.log("Apple enabled:", before.external_apple_enabled ?? "?");
  console.log("Google enabled:", before.external_google_enabled ?? "?");

  const patch = {
    site_url: PRODUCTION_SITE,
    uri_allow_list: buildUriAllowList(redirectUrls),
    disable_signup: false,
    external_apple_enabled: true,
    external_google_enabled: true,
  };

  const after = await patchSupabaseAuthConfig(PROJECT_REF, token, patch);
  console.log("\nDone.");
  console.log("site_url:", after.site_url);
  console.log("redirect entries:", (after.uri_allow_list ?? "").split(",").filter(Boolean).length);
  console.log("Apple enabled:", after.external_apple_enabled);
  console.log("Google enabled:", after.external_google_enabled);
  console.log("disable_signup:", after.disable_signup);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
