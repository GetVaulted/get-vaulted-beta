import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const ensurePrismaUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword },
  }),
}));

vi.mock("@/lib/ensure-prisma-user-from-supabase-auth", () => ({
  ensurePrismaUserForSupabaseAuth: (...args: unknown[]) => ensurePrismaUser(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { authorizeCredentialsViaSupabase } from "@/lib/authenticate-supabase-credentials";

describe("authorizeCredentialsViaSupabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("returns null when Supabase sign-in fails", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    await expect(authorizeCredentialsViaSupabase("a@b.com", "pass")).resolves.toBeNull();
  });

  it("returns session user when Supabase and Prisma align", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "auth-uuid", email: "sellerqa@getvaultedtest.com" } },
      error: null,
    });
    ensurePrismaUser.mockResolvedValue("auth-uuid");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "auth-uuid",
      email: "sellerqa@getvaultedtest.com",
      username: "sellerqa",
      role: "user",
      suspendedAt: null,
      emailVerified: new Date(),
    } as never);

    const user = await authorizeCredentialsViaSupabase("sellerqa@getvaultedtest.com", "VaultedBetaQA1!");
    expect(user).toEqual({
      id: "auth-uuid",
      email: "sellerqa@getvaultedtest.com",
      name: "sellerqa",
      role: "user",
    });
  });

  it("syncs emailVerified when Supabase sign-in succeeds on beta", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "auth-uuid", email: "sellerqa@getvaultedtest.com" } },
      error: null,
    });
    ensurePrismaUser.mockResolvedValue("auth-uuid");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "auth-uuid",
      email: "sellerqa@getvaultedtest.com",
      username: "sellerqa",
      role: "user",
      suspendedAt: null,
      emailVerified: null,
    } as never);

    const user = await authorizeCredentialsViaSupabase("sellerqa@getvaultedtest.com", "VaultedBetaQA1!");
    expect(user?.id).toBe("auth-uuid");
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
});
