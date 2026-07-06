import { beforeEach, describe, expect, it } from "vitest";
import { checkAuthAttemptRateLimit } from "@/lib/auth-rate-limit";
import { __resetRateLimitsForTests } from "@/lib/request-rate-limit";

describe("checkAuthAttemptRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
  });

  it("allows the first 10 attempts for an email within the window", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkAuthAttemptRateLimit("login", "victim@example.com").ok).toBe(true);
    }
  });

  it("blocks the 11th attempt for the same email/scope (brute-force protection)", () => {
    for (let i = 0; i < 10; i++) {
      checkAuthAttemptRateLimit("login", "victim@example.com");
    }
    const result = checkAuthAttemptRateLimit("login", "victim@example.com");
    expect(result.ok).toBe(false);
  });

  it("normalizes email casing/whitespace so attackers can't bypass by varying case", () => {
    for (let i = 0; i < 10; i++) {
      checkAuthAttemptRateLimit("login", "Victim@Example.com");
    }
    const result = checkAuthAttemptRateLimit("login", "  victim@example.com  ");
    expect(result.ok).toBe(false);
  });

  it("scopes limits independently so login attempts don't exhaust verify-email budget", () => {
    for (let i = 0; i < 10; i++) {
      checkAuthAttemptRateLimit("login", "victim@example.com");
    }
    expect(checkAuthAttemptRateLimit("verify-email", "victim@example.com").ok).toBe(true);
  });

  it("scopes limits independently per email so one account can't exhaust another's budget", () => {
    for (let i = 0; i < 10; i++) {
      checkAuthAttemptRateLimit("login", "victim@example.com");
    }
    expect(checkAuthAttemptRateLimit("login", "someone-else@example.com").ok).toBe(true);
  });
});
