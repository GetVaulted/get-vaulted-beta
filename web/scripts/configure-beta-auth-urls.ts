/**
 * Push Supabase Auth site URL + redirect allowlist for beta (xkaaicokjgmpbctfermj).
 * Uses Management API PATCH so OAuth provider secrets in the dashboard are not overwritten.
 *
 * Usage: SUPABASE_ACCESS_TOKEN=sbp_... CONFIRM_BETA_AUTH_URLS=1 npm run configure:beta-auth-urls
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

const BETA_SITE = "https://beta.shopgetvaulted.com";
const BETA_REF = "xkaaicokjgmpbctfermj";

async function main() {
  if (process.env.CONFIRM_BETA_AUTH_URLS !== "1") {
    console.error("Refusing: set CONFIRM_BETA_AUTH_URLS=1");
    process.exit(1);
  }

  const token = requireSupabaseAccessToken();

  const redirectUrls = [
    BETA_SITE,
    `${BETA_SITE}/signin`,
    `${BETA_SITE}/join`,
    ...SUPABASE_OAUTH_REDIRECT_ALLOWLIST.filter((u) => u.startsWith("https://beta.")),
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000/auth/callback",
    "http://localhost:3000/auth/callback",
    "http://127.0.0.1:3000/mobile/auth/callback",
    "http://localhost:3000/mobile/auth/callback",
  ];

  const before = await getSupabaseAuthConfig(BETA_REF, token);
  console.log("Current site_url:", before.site_url ?? "(unset)");

  const after = await patchSupabaseAuthConfig(BETA_REF, token, {
    site_url: BETA_SITE,
    uri_allow_list: buildUriAllowList(redirectUrls),
    disable_signup: false,
    external_apple_enabled: true,
    external_google_enabled: true,
  });

  console.log("Done. Site URL:", after.site_url);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
