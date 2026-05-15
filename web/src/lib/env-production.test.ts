import { afterEach, describe, expect, it, vi } from "vitest";
import { assertTrustapStubForbiddenInProduction } from "@/lib/env-production";

describe("assertTrustapStubForbiddenInProduction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when NODE_ENV is production, escrow enabled, and TRUSTAP_USE_STUB_RESPONSE is 1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    expect(() => assertTrustapStubForbiddenInProduction()).toThrow(/TRUSTAP_USE_STUB_RESPONSE/);
  });

  it("does not throw in non-production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    expect(() => assertTrustapStubForbiddenInProduction()).not.toThrow();
  });

  it("does not throw in production when stub is off", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "0");
    expect(() => assertTrustapStubForbiddenInProduction()).not.toThrow();
  });

  it("does not throw in production when escrow features are off even if stub is 1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ESCROW_ENABLED", "false");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");
    expect(() => assertTrustapStubForbiddenInProduction()).not.toThrow();
  });
});
