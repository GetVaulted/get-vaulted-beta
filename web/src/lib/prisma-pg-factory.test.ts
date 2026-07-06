import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression: no slow-query logging existed at all (performance audit 2026-07) — there was no
// way to spot an unbounded/missing-index query from logs before it caused a timeout.

let capturedOptions: Record<string, unknown> | undefined;
let queryListener: ((e: { query: string; duration: number }) => void) | undefined;

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation((options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      $on: (_event: string, cb: typeof queryListener) => {
        queryListener = cb;
      },
    };
  }),
}));

describe("createPostgresPrismaClient — slow query logging", () => {
  beforeEach(() => {
    capturedOptions = undefined;
    queryListener = undefined;
  });

  afterEach(() => {
    // NOTE: intentionally not `vi.restoreAllMocks()` — that would wipe the `.mockImplementation`
    // set on the module-level `PrismaClient`/`Pool`/`PrismaPg` mocks above, breaking later tests.
    vi.unstubAllEnvs();
  });

  it("subscribes to query events with a query-level log config", async () => {
    const { createPostgresPrismaClient } = await import("./prisma-pg-factory");
    createPostgresPrismaClient("postgres://example/test-db-a");

    expect(capturedOptions?.log).toEqual([{ level: "query", emit: "event" }]);
    expect(queryListener).toBeTypeOf("function");
  });

  it("warns when a query exceeds the slow-query threshold", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createPostgresPrismaClient } = await import("./prisma-pg-factory");
    createPostgresPrismaClient("postgres://example/test-db-b");

    queryListener?.({ query: "SELECT * FROM \"Listing\"", duration: 900 });
    expect(warnSpy).toHaveBeenCalledWith(
      "[slow-query]",
      "900ms",
      expect.stringContaining("SELECT"),
    );
  });

  it("does not warn for fast queries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createPostgresPrismaClient } = await import("./prisma-pg-factory");
    createPostgresPrismaClient("postgres://example/test-db-c");

    queryListener?.({ query: "SELECT 1", duration: 5 });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
