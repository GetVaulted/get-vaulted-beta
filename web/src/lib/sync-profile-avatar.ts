import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** Keep Supabase `profiles.avatar_url` in sync with Prisma `User.image` for cross-device + live chat. */
export async function syncSupabaseProfileAvatar(userId: string, avatarUrl: string | null): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.warn("[syncSupabaseProfileAvatar] Supabase admin not configured — avatar saved to app DB only.");
    return;
  }

  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) {
    console.error("[syncSupabaseProfileAvatar] profiles update failed", error.message);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { avatar_url: avatarUrl },
  });
  if (authError) {
    console.error("[syncSupabaseProfileAvatar] auth metadata update failed", authError.message);
  }
}
