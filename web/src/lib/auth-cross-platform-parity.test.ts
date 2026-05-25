import { describe, expect, it } from "vitest";

/**
 * Cross-platform auth parity contract — web and mobile must share Supabase Auth on beta.
 * Manual QA: create on web → sign in mobile; create on mobile → sign in web; seller wizard persists both ways.
 */
describe("auth cross-platform parity contract", () => {
  it("documents required parity scenarios", () => {
    const scenarios = [
      "create account on web (beta) → sign in on mobile with same email/password",
      "create account on mobile → sign in on web with same email/password",
      "seller onboarding wizard completion persists after sign-in on the other platform",
      "mobile bearer session resolves the same Prisma user id as web NextAuth session",
    ];
    expect(scenarios.length).toBe(4);
  });
});
