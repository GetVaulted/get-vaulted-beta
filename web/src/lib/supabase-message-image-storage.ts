import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Default bucket; override with `SUPABASE_MESSAGE_IMAGES_BUCKET`. */
export const MESSAGE_IMAGES_BUCKET_DEFAULT = "message-images";

export function getMessageImagesBucketName(): string {
  const b = process.env.SUPABASE_MESSAGE_IMAGES_BUCKET?.trim();
  return b && b.length > 0 ? b : MESSAGE_IMAGES_BUCKET_DEFAULT;
}

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

/** True when server-side DM image uploads should use Supabase Storage. */
export function isSupabaseMessageImageStorageConfigured(): boolean {
  return Boolean(getServiceRoleClient());
}

export type UploadMessageImageToSupabaseResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Upload a DM photo to `message-images/{userId}/{uuid}.{ext}` via the service role key
 * (server-only, bypasses RLS). Object key must already be unique — caller passes a UUID name.
 */
export async function uploadMessageImageToSupabase(
  userId: string,
  objectName: string,
  body: Buffer,
  contentType: string,
): Promise<UploadMessageImageToSupabaseResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }
  const uid = userId.trim();
  if (!uid) {
    return { ok: false, message: "Missing account id for image upload." };
  }
  const bucket = getMessageImagesBucketName();
  const objectKey = `${uid}/${objectName}`;

  // Keep well under typical mobile client timeouts — RN multipart aborts are unreliable.
  const UPLOAD_MS = 15_000;
  let timedOut = false;
  const { error } = await Promise.race([
    supabase.storage.from(bucket).upload(objectKey, body, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    }),
    new Promise<{ error: { message: string } }>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve({ error: { message: "Message image upload timed out." } });
      }, UPLOAD_MS);
    }),
  ]);

  if (error) {
    console.error("[uploadMessageImageToSupabase]", error.message);
    return {
      ok: false,
      message: timedOut ? "Upload timed out. Try a smaller photo." : "Upload failed.",
    };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    return { ok: false, message: "Upload failed." };
  }
  return { ok: true, publicUrl };
}
