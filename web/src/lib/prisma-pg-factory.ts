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

/**
 * Real-world data (Netlify logs, Sep 2026): a plain single-row SELECT queued for 219,921ms
 * (~3m40s) during a live show. node-postgres has no built-in cap on how long a caller waits for
 * a pool connection to free up (see `getOrCreatePool` above — `connectionTimeoutMillis` only
 * bounds establishing a *new* connection, not waiting for a busy one to be released), so under
 * DB contention a read can hang far longer than any client-side reconnect/retry timeout in the
 * app, with no way for the caller to recover. This gives every read operation a hard deadline so
 * it fails fast and predictably instead of queuing indefinitely.
 *
 * Deliberately scoped to READ operations only (see READ_OPERATIONS below) — never writes, and
 * never raw SQL (which could be either). Racing a write against a timeout is dangerous: the
 * caller sees a rejection and may retry or report failure, while the original write can still
 * land moments later server-side, risking a duplicate-submit bug (e.g. a retried purchase). A
 * timed-out read has no such risk — nothing was ever mutated, so the caller can safely retry or
 * fail visibly. (A handful of hot-path reads — e.g. `getStreamRow` in the live-stream routes —
 * already have their own tighter, purpose-built timeout with dedicated error handling; this is
 * the broader safety net for everything else.)
 */
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const READ_QUERY_TIMEOUT_MS = Number(process.env.PRISMA_READ_TIMEOUT_MS ?? 8_000);

function withReadTimeout<T>(promise: Promise<T>, model: string, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `DB_READ_TIMEOUT: ${model}.${operation} exceeded ${READ_QUERY_TIMEOUT_MS}ms (likely DB connection-pool contention)`,
        ),
      );
    }, READ_QUERY_TIMEOUT_MS);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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

  return client.$extends({
    name: "read-query-deadline",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!READ_OPERATIONS.has(operation)) return query(args);
          return withReadTimeout(query(args), model ?? "unknown", operation);
        },
      },
    },
  }) as unknown as PrismaClient;
}
