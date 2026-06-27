import { lookup } from "node:dns/promises";

/** Extract Supabase project ref from Postgres URI or Supabase HTTPS URL (no secrets). */
export function supabaseProjectRefFromUrl(url: string): string | null {
  const u = url.trim();
  const hostMatch = u.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (hostMatch?.[1]) return hostMatch[1];
  const dbHost = u.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  if (dbHost?.[1]) return dbHost[1];
  const pooler = u.match(/postgres\.([a-z0-9]+)(?::|@)/i);
  if (pooler?.[1]) return pooler[1];
  return null;
}

/** Extract host, database name, and user from a Postgres URL (no secrets). */
export function parseDatabaseConnectionInfo(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  projectRef: string | null;
} {
  try {
    const scheme = url.startsWith("postgresql:") ? "postgresql:" : "postgres:";
    const parsed = new URL(url.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      user: parsed.username || "(unknown)",
      projectRef: supabaseProjectRefFromUrl(url),
    };
  } catch {
    return {
      host: "(invalid url)",
      port: "?",
      database: "?",
      user: "?",
      projectRef: supabaseProjectRefFromUrl(url),
    };
  }
}

/** Redact password in postgres URLs for logs. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    if (parsed.password) parsed.password = "***";
    return parsed.toString().replace(/^http:/, url.startsWith("postgresql:") ? "postgresql:" : "postgres:");
  } catch {
    return "(invalid url)";
  }
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.NODE_ENV === "production",
  );
}

/**
 * Supabase session pooler (:5432) caps concurrent clients (~15). Serverless runtimes
 * should use the transaction pooler (:6543) with Prisma PgBouncer flags.
 */
export function normalizeDatabaseUrlForServerlessRuntime(url: string): string {
  try {
    const scheme = url.startsWith("postgresql:") ? "postgresql:" : url.startsWith("postgres:") ? "postgres:" : null;
    if (!scheme) return url;

    const parsed = new URL(url.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    const host = parsed.hostname.toLowerCase();
    const isSupabasePooler = host.includes(".pooler.supabase.com");
    if (!isSupabasePooler) return url;

    const port = parsed.port || "5432";
    const useTransactionPool = isServerlessRuntime() && port === "5432";
    if (useTransactionPool) parsed.port = "6543";

    if (isServerlessRuntime() || useTransactionPool) {
      if (!parsed.searchParams.has("pgbouncer")) parsed.searchParams.set("pgbouncer", "true");
      if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "1");
    }

    const out = parsed.toString().replace(/^http:/, scheme);
    return out;
  } catch {
    return url;
  }
}

/**
 * Runtime + scripts: prefer `DATABASE_URL` (Netlify / Next), fall back to `INTEGRATION_DATABASE_URL` (local tests).
 */
export function resolveDatabaseUrl(): string {
  let url = process.env.DATABASE_URL?.trim() ?? process.env.INTEGRATION_DATABASE_URL?.trim() ?? "";
  if (
    url.length >= 2 &&
    ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'")))
  ) {
    url = url.slice(1, -1).trim();
  }
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set DATABASE_URL (or INTEGRATION_DATABASE_URL for local scripts) in web/.env — must be the same Supabase Postgres as mobile EXPO_PUBLIC_SUPABASE_URL.",
    );
  }
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URI.");
  }
  return normalizeDatabaseUrlForServerlessRuntime(url);
}

/**
 * Prefer direct Supabase Postgres (db.{ref}.supabase.co:5432) for Prisma migrate + Vitest.
 * Session pooler URIs are rewritten; transaction pooler (:6543) is rejected for integration.
 */
export function normalizeIntegrationDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  const ref = supabaseProjectRefFromUrl(trimmed);
  if (!ref) return trimmed;

  try {
    const scheme = trimmed.startsWith("postgresql:") ? "postgresql:" : "postgres:";
    const parsed = new URL(trimmed.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    const port = parsed.port || "5432";
    if (parsed.hostname.includes(".pooler.supabase.com") && port === "6543") {
      throw new Error(
        "INTEGRATION_DATABASE_URL must use Supabase Session mode (pooler port 5432) or direct db.{ref}.supabase.co — not the transaction pooler (:6543).",
      );
    }
    if (parsed.hostname.includes(".pooler.supabase.com")) {
      parsed.hostname = `db.${ref}.supabase.co`;
      parsed.port = "5432";
      parsed.username = "postgres";
      parsed.search = "";
    }
    return parsed.toString().replace(/^http:/, scheme);
  } catch (e) {
    if (e instanceof Error && e.message.includes("INTEGRATION_DATABASE_URL")) throw e;
    return trimmed;
  }
}

/** Fail fast when a Supabase integration project ref no longer exists (deleted project). */
export async function assertSupabaseIntegrationProjectReachable(url: string): Promise<void> {
  const ref = supabaseProjectRefFromUrl(url);
  if (!ref) return;
  const host = `db.${ref}.supabase.co`;
  try {
    await lookup(host);
  } catch {
    throw new Error(
      `INTEGRATION_DATABASE_URL references Supabase project "${ref}" but ${host} does not resolve. ` +
        "That project was deleted or the ref is wrong. Create a disposable Supabase Postgres project " +
        "(free tier) for integration tests and set INTEGRATION_DATABASE_URL to its Session pooler URI (port 5432). " +
        "Do not reuse beta/production DATABASE_URL — integration tests run migrate deploy and full database reset.",
    );
  }
}
