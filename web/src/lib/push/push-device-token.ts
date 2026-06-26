import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * A physical device Expo token must belong to at most one account — otherwise
 * User B logged in on a shared phone still receives User A's win/charge pushes.
 */
export async function reassignExpoPushTokenToUser(args: {
  userId: string;
  expoPushToken: string;
  supabaseAuthUserId?: string | null;
}): Promise<void> {
  await prisma.pushDeviceToken.deleteMany({
    where: {
      expoPushToken: args.expoPushToken,
      userId: { not: args.userId },
    },
  });

  const admin = getSupabaseAdminClient();
  const supabaseAuthUserId = args.supabaseAuthUserId?.trim();
  if (!admin || !supabaseAuthUserId) return;

  await admin
    .from("push_device_tokens")
    .delete()
    .eq("expo_push_token", args.expoPushToken)
    .neq("user_id", supabaseAuthUserId);
}

/** Remove push registration for the signed-in user (logout / account switch). */
export async function revokeExpoPushTokensForUser(args: {
  userId: string;
  expoPushToken?: string | null;
  supabaseAuthUserId?: string | null;
}): Promise<void> {
  const token = args.expoPushToken?.trim();
  if (token) {
    await prisma.pushDeviceToken.deleteMany({
      where: { userId: args.userId, expoPushToken: token },
    });
  } else {
    await prisma.pushDeviceToken.deleteMany({ where: { userId: args.userId } });
  }

  const admin = getSupabaseAdminClient();
  const supabaseAuthUserId = args.supabaseAuthUserId?.trim();
  if (!admin || !supabaseAuthUserId) return;

  if (token) {
    await admin.from("push_device_tokens").delete().eq("user_id", supabaseAuthUserId).eq("expo_push_token", token);
  } else {
    await admin.from("push_device_tokens").delete().eq("user_id", supabaseAuthUserId);
  }
}
