/**
 * Safety guards for destructive live-launch wipe (go-live fresh start).
 *
 * Beta and production share Supabase project xkaaicokjgmpbctfermj — this script is explicitly
 * for clearing commerce data before launch. Unlike beta-only wipes, production site URLs are
 * allowed when confirmation env vars are set.
 */
import { EXPECTED_BETA_PROJECT_REF } from "../../src/lib/beta-qa-scope";
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../../src/lib/resolve-database-url";

export type LiveLaunchWipeEnv = {
  supabaseUrl: string;
  serviceKey: string;
  dbRef: string;
  preserveEmails: string[];
};

export function parsePreserveAuthEmails(): string[] {
  const raw = process.env.PRESERVE_AUTH_EMAILS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function assertLiveLaunchWipeAllowed(): LiveLaunchWipeEnv {
  if (process.env.CONFIRM_LIVE_LAUNCH_WIPE !== "1") {
    console.error("Refusing: set CONFIRM_LIVE_LAUNCH_WIPE=1 to wipe application data for go-live.");
    process.exit(1);
  }

  const final = process.env.CONFIRM_LIVE_LAUNCH_WIPE_FINAL?.trim() ?? "";
  if (final !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: set CONFIRM_LIVE_LAUNCH_WIPE_FINAL=${EXPECTED_BETA_PROJECT_REF} (final confirmation gate).`,
    );
    process.exit(1);
  }

  const preserveEmails = parsePreserveAuthEmails();
  if (preserveEmails.length === 0) {
    console.error(
      "Refusing: set PRESERVE_AUTH_EMAILS with at least one account to keep (e.g. Apple reviewer).",
    );
    console.error('Example: PRESERVE_AUTH_EMAILS="reviewer@example.com"');
    process.exit(1);
  }

  let dbUrl: string;
  try {
    dbUrl = resolveDatabaseUrl();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const dbRef = supabaseProjectRefFromUrl(dbUrl);
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);

  if (dbRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: DATABASE_URL project ref must be ${EXPECTED_BETA_PROJECT_REF}, got ${dbRef ?? "?"}.`,
    );
    process.exit(1);
  }
  if (supaRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: SUPABASE_URL project ref must be ${EXPECTED_BETA_PROJECT_REF}, got ${supaRef ?? "?"}.`,
    );
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  return { supabaseUrl, serviceKey, dbRef: dbRef!, preserveEmails };
}

export function printLiveLaunchWipeBanner(dryRun: boolean, preserveEmails: string[]) {
  console.log("");
  console.log("=".repeat(72));
  console.log(dryRun ? "LIVE LAUNCH WIPE — DRY RUN (no changes)" : "LIVE LAUNCH WIPE — LIVE");
  console.log(`Target: Supabase project ${EXPECTED_BETA_PROJECT_REF}`);
  console.log(`Preserve Auth emails: ${preserveEmails.join(", ")}`);
  console.log("Clears all commerce/user app data. Tax nexus + platform config tables kept.");
  console.log("=".repeat(72));
  console.log("");
}
