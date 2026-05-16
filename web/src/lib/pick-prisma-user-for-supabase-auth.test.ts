import { describe, expect, it } from "vitest";
import { pickPrismaUserIdForSupabaseSession } from "@/lib/pick-prisma-user-for-supabase-auth";

describe("pickPrismaUserIdForSupabaseSession", () => {
  it("prefers email-linked user when it has Stripe and Supabase-id user does not", () => {
    const id = pickPrismaUserIdForSupabaseSession({
      supabaseUserId: "supabase-uuid",
      byId: { id: "supabase-uuid", stripeAccountId: null },
      byEmail: { id: "legacy-cuid", stripeAccountId: "acct_123" },
    });
    expect(id).toBe("legacy-cuid");
  });

  it("keeps Supabase-id user when it already has Stripe", () => {
    const id = pickPrismaUserIdForSupabaseSession({
      supabaseUserId: "supabase-uuid",
      byId: { id: "supabase-uuid", stripeAccountId: "acct_mobile" },
      byEmail: { id: "legacy-cuid", stripeAccountId: "acct_web" },
    });
    expect(id).toBe("supabase-uuid");
  });

  it("returns Supabase id when only that row exists", () => {
    expect(
      pickPrismaUserIdForSupabaseSession({
        supabaseUserId: "supabase-uuid",
        byId: { id: "supabase-uuid", stripeAccountId: null },
        byEmail: null,
      }),
    ).toBe("supabase-uuid");
  });
});
