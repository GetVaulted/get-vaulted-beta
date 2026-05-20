import { PrismaClient } from "@/generated/prisma/client";
import { createPostgresPrismaClient } from "@/lib/prisma-pg-factory";
import { resolveDatabaseUrl } from "@/lib/resolve-database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  /** Last `DATABASE_URL` used to build `prisma` (see `resolveClient`). */
  prismaBoundUrl?: string;
};

/** When set, all `@/lib/prisma` consumers use this client (integration tests only). */
declare global {
  // eslint-disable-next-line no-var
  var __GV_INTEGRATION_PRISMA__: PrismaClient | undefined;
}

function requireDatabaseUrl(): string {
  return resolveDatabaseUrl();
}

function resolveClient(): PrismaClient {
  if (globalThis.__GV_INTEGRATION_PRISMA__) {
    return globalThis.__GV_INTEGRATION_PRISMA__;
  }

  const url = requireDatabaseUrl();

  // Next.js "Reload env" updates `process.env` but can leave a cached Prisma client
  // pointing at the old connection string — reconnect when the URL changes.
  if (globalForPrisma.prisma && globalForPrisma.prismaBoundUrl !== url) {
    void globalForPrisma.prisma.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaBoundUrl = undefined;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPostgresPrismaClient(url);
    globalForPrisma.prismaBoundUrl = url;
  }
  return globalForPrisma.prisma;
}

/**
 * Route `prisma` through a Proxy so integration tests can install a dedicated PostgreSQL
 * client without importing the app before the override exists.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
}) as unknown as PrismaClient;

/** Vitest imports many modules transitively; eager-connect would force DATABASE_URL before integration `beforeAll` installs `__GV_INTEGRATION_PRISMA__`. */
const vitestRuntime = Boolean(process.env.VITEST_WORKER_ID ?? process.env.VITEST);
if (process.env.NODE_ENV !== "production" && !globalThis.__GV_INTEGRATION_PRISMA__ && !vitestRuntime) {
  void resolveClient();
}

/** @internal Attach a dedicated Prisma client for Vitest integration runs. Pass `undefined` to detach. */
export function setIntegrationPrismaClient(client: PrismaClient | undefined): void {
  globalThis.__GV_INTEGRATION_PRISMA__ = client;
}
