/**
 * Hard safety guards for destructive beta-only wipe scripts.
 * ONLY project xkaaicokjgmpbctfermj is allowed — strict allowlist, not blocklist.
 */
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../../src/lib/resolve-database-url";
import { EXPECTED_BETA_PROJECT_REF } from "../../src/lib/beta-qa-scope";

export type BetaWipeEnv = {
  supabaseUrl: string;
  serviceKey: string;
  dbRef: string;
};

export function assertBetaFullWipeAllowed(opts?: { noSeed?: boolean }): BetaWipeEnv {
  if (process.env.CONFIRM_BETA_FULL_WIPE !== "1") {
    console.error(
      "Refusing: set CONFIRM_BETA_FULL_WIPE=1 to wipe ALL beta application data.",
    );
    process.exit(1);
  }
  if (!opts?.noSeed && process.env.ALLOW_BETA_QA_SEED !== "1") {
    console.error("Refusing: set ALLOW_BETA_QA_SEED=1 (required for post-wipe seed). Use --no-seed for empty beta.");
    process.exit(1);
  }
  if (opts?.noSeed && process.env.CONFIRM_BETA_EMPTY_WIPE !== "1") {
    console.error("Refusing: set CONFIRM_BETA_EMPTY_WIPE=1 when using --no-seed (zero accounts after wipe).");
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
    console.error("This script NEVER runs against production or unknown databases.");
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

  return { supabaseUrl, serviceKey, dbRef: dbRef! };
}

export function printBetaWipeBanner(dryRun: boolean, empty = false) {
  console.log("");
  console.log("=".repeat(72));
  console.log(
    dryRun
      ? empty
        ? "BETA EMPTY WIPE — DRY RUN (no changes, no seed)"
        : "BETA FULL WIPE — DRY RUN (no changes)"
      : empty
        ? "BETA EMPTY WIPE — LIVE (zero users, no seed)"
        : "BETA FULL WIPE — LIVE",
  );
  console.log(`Target: Supabase project ${EXPECTED_BETA_PROJECT_REF} ONLY`);
  console.log("Production and other project refs are blocked.");
  console.log("=".repeat(72));
  console.log("");
}
