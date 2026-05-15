import { afterEach, describe, expect, it, vi } from "vitest";

describe("ivs-ops-log", () => {
  afterEach(() => {
    delete process.env.IVS_OPS_LOG;
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
  });

  it("is disabled in production when IVS_OPS_LOG is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.IVS_OPS_LOG;
    vi.resetModules();
    const { isIvsOpsLogEnabled } = await import("@/lib/ivs-ops-log");
    expect(isIvsOpsLogEnabled()).toBe(false);
  });

  it("is enabled in production when IVS_OPS_LOG=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.IVS_OPS_LOG = "true";
    vi.resetModules();
    const { isIvsOpsLogEnabled } = await import("@/lib/ivs-ops-log");
    expect(isIvsOpsLogEnabled()).toBe(true);
  });

  it("is disabled when IVS_OPS_LOG=false even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.IVS_OPS_LOG = "false";
    vi.resetModules();
    const { isIvsOpsLogEnabled } = await import("@/lib/ivs-ops-log");
    expect(isIvsOpsLogEnabled()).toBe(false);
  });

  it("is enabled in test (non-production) when IVS_OPS_LOG unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.IVS_OPS_LOG;
    vi.resetModules();
    const { isIvsOpsLogEnabled } = await import("@/lib/ivs-ops-log");
    expect(isIvsOpsLogEnabled()).toBe(true);
  });
});
