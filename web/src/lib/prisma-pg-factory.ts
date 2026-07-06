import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const poolByUrl = new Map<string, Pool>();

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.NODE_ENV === "production",
  );
}

function getOrCreatePool(connectionString: string): Pool {
  const cached = poolByUrl.get(connectionString);
  if (cached) return cached;

  const pool = new Pool({
    connectionString,
    max: isServerlessRuntime() ? 1 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  });
  poolByUrl.set(connectionString, pool);
  return pool;
}

/**
 * Threshold (ms) above which a query is logged as slow. No APM/query-latency dashboard exists
 * today (performance audit 2026-07) — this is the cheapest signal to catch regressions (e.g.
 * an unbounded `findMany` or a missing index) in existing log/Sentry-breadcrumb tooling before
 * they escalate into a timeout.
 */
const SLOW_QUERY_THRESHOLD_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 500);

/** Prisma 7+: Postgres requires a driver adapter (URL lives in `prisma.config.ts` for Migrate). */
export function createPostgresPrismaClient(connectionString: string): PrismaClient {
  const pool = getOrCreatePool(connectionString);
  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: [{ level: "query", emit: "event" }],
  });

  // Prisma's typed `$on` overloads don't line up with the dynamic `log` config above; the
  // event shape (`{ query, params, duration }`) is documented and stable across log levels.
  (client as unknown as { $on: (event: "query", cb: (e: { query: string; duration: number }) => void) => void }).$on(
    "query",
    (e) => {
      if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
        console.warn("[slow-query]", `${e.duration}ms`, e.query.slice(0, 300));
      }
    },
  );

  return client;
}
