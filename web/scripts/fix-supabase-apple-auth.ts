/**
 * Re-enable Apple OAuth on Supabase after an accidental config push disabled it.
 * Only toggles external_apple_enabled — does not touch client secrets.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... CONFIRM_FIX_APPLE_AUTH=1 npm run fix:supabase-apple-auth
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  getSupabaseAuthConfig,
  patchSupabaseAuthConfig,
  requireSupabaseAccessToken,
} from "./lib/supabase-management-auth";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const PROJECT_REF = "xkaaicokjgmpbctfermj";

require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

async function main() {
  if (process.env.CONFIRM_FIX_APPLE_AUTH !== "1") {
    console.error("Refusing: set CONFIRM_FIX_APPLE_AUTH=1");
    process.exit(1);
  }

  const token = requireSupabaseAccessToken();
  const before = await getSupabaseAuthConfig(PROJECT_REF, token);
  console.log("Before — Apple enabled:", before.external_apple_enabled);

  if (before.external_apple_enabled === true) {
    console.log("Apple OAuth already enabled. Nothing to do.");
    return;
  }

  const after = await patchSupabaseAuthConfig(PROJECT_REF, token, { external_apple_enabled: true });
  console.log("After — Apple enabled:", after.external_apple_enabled);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
