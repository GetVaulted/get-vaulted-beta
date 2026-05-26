/**
 * Smoke-test local Supabase credential auth (no HTTP). Usage:
 *   npx tsx scripts/test-local-supabase-signin.ts user@example.com
 * Password via BETA_QA_ACCOUNT_PASSWORD or prompt-less env LOCAL_TEST_PASSWORD.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const email = process.argv[2]?.trim();
const password =
  process.env.LOCAL_TEST_PASSWORD?.trim() ??
  process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ??
  "VaultedBetaQA1!";

if (!email) {
  console.error("Usage: npx tsx scripts/test-local-supabase-signin.ts <email>");
  process.exit(1);
}

async function main() {
  const { authorizeCredentialsViaSupabase, getSupabaseAuthServerClient } = await import(
    "../src/lib/authenticate-supabase-credentials"
  );

  const client = getSupabaseAuthServerClient();
  if (!client) {
    console.error("✗ Supabase auth client not configured (NEXT_PUBLIC_SUPABASE_ANON_KEY missing)");
    process.exit(1);
  }

  console.log("NEXTAUTH_URL:", process.env.NEXTAUTH_URL ?? "(unset)");
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  console.log("Testing sign-in for:", email);

  const user = await authorizeCredentialsViaSupabase(email, password);
  if (user) {
    console.log("✓ authorizeCredentialsViaSupabase OK");
    console.log("  user id:", user.id);
    console.log("  username:", user.name);
    process.exit(0);
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  console.error("✗ Sign-in failed");
  console.error("  Supabase error:", error?.message ?? "unknown");
  console.error("  Check: email/password, emailVerified on Prisma User, account suspended");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
