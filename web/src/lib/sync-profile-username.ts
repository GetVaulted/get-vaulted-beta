import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Keep Supabase `profiles.username` + `display_name` and auth metadata in sync with Prisma `User.username`.
 * Display name is not a separate identity — it always equals username so @mentions match what people see.
 */
export async function syncSupabaseProfileUsername(userId: string, username: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.warn("[syncSupabaseProfileUsername] Supabase admin not configured — username saved to app DB only.");
    return;
  }

  const { error } = await admin
    .from("profiles")
    .update({ username, display_name: username })
    .eq("id", userId);
  if (error) {
    console.error("[syncSupabaseProfileUsername] profiles update failed", error.message);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { username, display_name: username },
  });
  if (authError) {
    console.error("[syncSupabaseProfileUsername] auth metadata update failed", authError.message);
  }
}
