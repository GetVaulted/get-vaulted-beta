import { describe, expect, it, vi, beforeEach } from "vitest";
import Expo from "expo-server-sdk";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushDeviceToken: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => null,
}));

describe("sendExpoPushForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EXPO_PUSH_DISABLED;
  });

  it("skips when EXPO_PUSH_DISABLED is set", async () => {
    process.env.EXPO_PUSH_DISABLED = "1";
    const { sendExpoPushForUser } = await import("@/lib/push/send-expo-push");
    await expect(
      sendExpoPushForUser({
        userId: "user_1",
        title: "Sold",
        body: "Item sold",
        href: "/account/sales",
        type: "item_sold",
      }),
    ).resolves.toBeUndefined();
  });

  it("filters invalid expo tokens", async () => {
    const valid = Expo.isExpoPushToken("ExponentPushToken[abc]");
    expect(valid).toBe(true);
    expect(Expo.isExpoPushToken("not-a-token")).toBe(false);
  });
});
