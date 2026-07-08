import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** Keep Supabase `profiles.username` and auth metadata in sync with Prisma `User.username`. */
export async function syncSupabaseProfileUsername(userId: string, username: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.warn("[syncSupabaseProfileUsername] Supabase admin not configured — username saved to app DB only.");
    return;
  }

  const { error } = await admin.from("profiles").update({ username }).eq("id", userId);
  if (error) {
    console.error("[syncSupabaseProfileUsername] profiles update failed", error.message);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { username },
  });
  if (authError) {
    console.error("[syncSupabaseProfileUsername] auth metadata update failed", authError.message);
  }
}
