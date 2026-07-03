/**
 * Safety guards for reset-beta-qa-slate.ts — beta project allowlist only.
 *
 * NOTE: production currently shares the SAME Supabase project ref as beta
 * (EXPECTED_BETA_PROJECT_REF), so `BLOCKED_PROJECT_REFS` can never contain the production ref —
 * it would just block beta too. The real safety net is `findProductionHostEnvVar`, which checks
 * the local site-URL env vars (NEXT_PUBLIC_SITE_URL / NEXTAUTH_URL / SITE_URL) instead, since
 * those differ between the beta and production Netlify contexts even though the database doesn't.
 */
import {
  EXPECTED_BETA_API_HOST,
  EXPECTED_BETA_PROJECT_REF,
} from "../../src/lib/beta-qa-scope";
import { findProductionHostEnvVar } from "../../src/lib/production-host-guard";
import {
  parseDatabaseConnectionInfo,
  redactDatabaseUrl,
  resolveDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "../../src/lib/resolve-database-url";

/** Additional known-bad project refs, if a separate non-beta ref is ever documented. */
const BLOCKED_PROJECT_REFS = new Set<string>([]);

function looksLikeProductionDatabaseUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("production") && !lower.includes("beta")) return true;
  const ref = supabaseProjectRefFromUrl(url);
  if (ref && BLOCKED_PROJECT_REFS.has(ref)) return true;
  return false;
}

export type BetaSlateTarget = {
  dbUrl: string;
  dbRef: string;
  supabaseUrl: string;
  serviceKey: string;
};

export function assertBetaSlateResetAllowed(opts: { live: boolean; seed: boolean }): BetaSlateTarget {
  const prodHostVar = findProductionHostEnvVar();
  if (prodHostVar) {
    console.error(
      `Refusing: ${prodHostVar} looks like the production domain. This script never runs against production.`,
    );
    console.error(`Unset or correct ${prodHostVar} (should be beta.shopgetvaulted.com) and try again.`);
    process.exit(1);
  }

  if (opts.live && process.env.CONFIRM_RESET_BETA !== "YES") {
    console.error("Refusing: set CONFIRM_RESET_BETA=YES to reset beta QA slate.");
    console.error("Example: CONFIRM_RESET_BETA=YES npx tsx scripts/reset-beta-qa-slate.ts");
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
  const dbInfo = parseDatabaseConnectionInfo(dbUrl);
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  console.log("");
  console.log("=".repeat(72));
  console.log("BETA QA SLATE RESET — TARGET DATABASE");
  console.log("=".repeat(72));
  console.log(`Project ref (expected): ${EXPECTED_BETA_PROJECT_REF}`);
  console.log(`DATABASE_URL ref:       ${dbRef ?? "(unknown)"}`);
  console.log(`Host:                   ${dbInfo.host}:${dbInfo.port}`);
  console.log(`Database:               ${dbInfo.database}`);
  console.log(`User:                   ${dbInfo.user}`);
  console.log(`Redacted URL:           ${redactDatabaseUrl(dbUrl)}`);
  console.log(`SUPABASE_URL ref:       ${supaRef ?? "(missing)"}`);
  console.log(`Mode:                   ${opts.live ? "LIVE WIPE" : "dry-run"}${opts.seed ? " + seed" : " (empty)"}`);
  console.log("=".repeat(72));
  console.log("");

  if (!dbRef) {
    console.error("Refusing: could not determine Supabase project ref from DATABASE_URL.");
    process.exit(1);
  }
  if (dbRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: DATABASE_URL must target beta project ${EXPECTED_BETA_PROJECT_REF}, got ${dbRef}.`,
    );
    console.error("This script never runs against production or unknown databases.");
    process.exit(1);
  }
  if (looksLikeProductionDatabaseUrl(dbUrl)) {
    console.error("Refusing: DATABASE_URL appears to be production.");
    process.exit(1);
  }
  if (supaRef && supaRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: SUPABASE_URL must target ${EXPECTED_BETA_PROJECT_REF}, got ${supaRef}.`,
    );
    process.exit(1);
  }
  if (opts.live && opts.seed && !serviceKey) {
    console.error("Refusing: SUPABASE_SERVICE_ROLE_KEY required for --seed (Auth + Prisma users).");
    process.exit(1);
  }
  if (opts.live && !supabaseUrl) {
    console.error("Refusing: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) required for Auth cleanup.");
    process.exit(1);
  }

  return { dbUrl, dbRef, supabaseUrl, serviceKey };
}

export async function verifyBetaApiAligned(): Promise<boolean> {
  const host = (
    process.env.BETA_API_BASE_URL?.trim() ||
    process.env.SMOKE_BASE_URL?.trim() ||
    EXPECTED_BETA_API_HOST
  ).replace(/\/+$/, "");
  if (host !== EXPECTED_BETA_API_HOST.replace(/\/+$/, "")) {
    console.error(`Refusing: API host must be ${EXPECTED_BETA_API_HOST}, got ${host}`);
    return false;
  }
  try {
    const res = await fetch(`${host}/api/auth/config`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`Refusing: could not verify ${host}/api/auth/config (${res.status})`);
      return false;
    }
    const body = (await res.json()) as { projectRef?: string; alignedWithBeta?: boolean };
    if (body.projectRef !== EXPECTED_BETA_PROJECT_REF || body.alignedWithBeta === false) {
      console.error(
        `Refusing: deployed API projectRef=${body.projectRef ?? "?"} not aligned with beta.`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Refusing: could not reach ${host} — ${e instanceof Error ? e.message : e}`);
    return false;
  }
}
