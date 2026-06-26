import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMany = vi.fn();
const supabaseDelete = vi.fn(() => ({ eq: vi.fn(() => ({ neq: vi.fn().mockResolvedValue({ error: null }) })) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushDeviceToken: { deleteMany },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: vi.fn(() => ({ delete: supabaseDelete })),
  }),
}));

describe("push-device-token", () => {
  beforeEach(() => {
    deleteMany.mockReset();
    supabaseDelete.mockClear();
  });

  it("reassignExpoPushTokenToUser drops the token from other prisma users", async () => {
    const { reassignExpoPushTokenToUser } = await import("@/lib/push/push-device-token");
    await reassignExpoPushTokenToUser({
      userId: "user_b",
      expoPushToken: "ExponentPushToken[abc]",
      supabaseAuthUserId: "auth_b",
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        expoPushToken: "ExponentPushToken[abc]",
        userId: { not: "user_b" },
      },
    });
  });
});
