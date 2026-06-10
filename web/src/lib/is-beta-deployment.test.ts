import { afterEach, describe, expect, it, vi } from "vitest";
import { isBetaDeployment, webSignupVerificationMethod } from "./is-beta-deployment";

describe("isBetaDeployment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches beta Supabase URL", () => {
    vi.stubEnv("SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    expect(isBetaDeployment()).toBe(true);
  });

  it("does not match production ref", () => {
    vi.stubEnv("SUPABASE_URL", "https://quhjaiwdktdsgioacpeu.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(isBetaDeployment()).toBe(false);
  });

  it("prefers supabase_link on beta without Resend", () => {
    vi.stubEnv("SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(webSignupVerificationMethod()).toBe("supabase_link");
  });

  it("prefers supabase_link on beta even when Resend is configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(webSignupVerificationMethod()).toBe("supabase_link");
  });

  it("prefers resend_code when Resend is configured on non-beta", () => {
    vi.stubEnv("SUPABASE_URL", "https://quhjaiwdktdsgioacpeu.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(webSignupVerificationMethod()).toBe("resend_code");
  });
});
