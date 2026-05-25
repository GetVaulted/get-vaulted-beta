import { beforeEach, describe, expect, it, vi } from "vitest";

describe("unified auth policy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses Supabase as unified source on beta deploy", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    const { usesUnifiedSupabaseAuth, isEmailVerificationRequiredForSignIn } = await import("@/lib/unified-auth");
    expect(usesUnifiedSupabaseAuth()).toBe(true);
    expect(isEmailVerificationRequiredForSignIn()).toBe(false);
  });

  it("prefers supabase signup on beta even when Resend is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const { webSignupVerificationMethod } = await import("@/lib/is-beta-deployment");
    expect(webSignupVerificationMethod()).toBe("supabase_link");
  });
});

describe("syncPrismaEmailVerifiedFromSupabase", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("marks prisma user verified when Supabase sign-in succeeded on beta", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.doMock("@/lib/prisma", () => ({
      prisma: { user: { updateMany } },
    }));
    const { syncPrismaEmailVerifiedFromSupabase } = await import("@/lib/sync-prisma-email-verified");
    const at = await syncPrismaEmailVerifiedFromSupabase("user-1", {
      id: "user-1",
      email: "a@b.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    expect(at).toBeInstanceOf(Date);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", emailVerified: null },
      data: { emailVerified: expect.any(Date) },
    });
  });
});
