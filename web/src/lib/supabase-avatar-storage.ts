import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AVATARS_BUCKET = "avatars";

let serviceClient: SupabaseClient | null | undefined;

function getServiceRoleClient(): SupabaseClient | null {
  if (serviceClient !== undefined) return serviceClient;
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    serviceClient = null;
    return null;
  }
  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

export function isSupabaseAvatarStorageConfigured(): boolean {
  return Boolean(getServiceRoleClient());
}

export type UploadAvatarToSupabaseResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Upload profile photo to `avatars/{supabaseAuthUserId}/avatar.jpg` via service role (bypasses RLS).
 */
export async function uploadAvatarToSupabase(
  supabaseAuthUserId: string,
  body: Buffer,
  contentType: string,
): Promise<UploadAvatarToSupabaseResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }
  const authId = supabaseAuthUserId.trim();
  if (!authId) {
    return { ok: false, message: "Missing account id for avatar upload." };
  }

  const objectKey = `${authId}/avatar.jpg`;
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(objectKey, body, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    console.error("[uploadAvatarToSupabase]", error.message);
    return { ok: false, message: "Upload failed." };
  }

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectKey);
  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    return { ok: false, message: "Upload failed." };
  }
  // Bust CDN/browser cache after replace.
  const sep = publicUrl.includes("?") ? "&" : "?";
  return { ok: true, publicUrl: `${publicUrl}${sep}v=${Date.now()}` };
}
