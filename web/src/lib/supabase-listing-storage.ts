import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Default bucket; override with `SUPABASE_STORAGE_BUCKET`. */
export const LISTING_IMAGES_BUCKET_DEFAULT = "listing-images";

export function getListingImagesBucketName(): string {
  const b = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  return b && b.length > 0 ? b : LISTING_IMAGES_BUCKET_DEFAULT;
}

/** True when server-side listing uploads should use Supabase Storage. */
export function isSupabaseListingImageStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

let serviceClient: SupabaseClient | null | undefined;

function getServiceRoleClient(): SupabaseClient | null {
  if (serviceClient !== undefined) return serviceClient;
  const url = process.env.SUPABASE_URL?.trim();
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

export type UploadListingImageToSupabaseResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Upload bytes to the configured bucket. Uses the service role key (server-only).
 * Object key should be unique (e.g. `uuid.ext`).
 */
export async function uploadListingImageToSupabase(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<UploadListingImageToSupabaseResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }
  const bucket = getListingImagesBucketName();

  const { error } = await supabase.storage.from(bucket).upload(objectKey, body, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });

  if (error) {
    console.error("[uploadListingImageToSupabase]", error.message);
    return { ok: false, message: "Upload failed." };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  const publicUrl = data.publicUrl;
  if (!publicUrl) {
    return { ok: false, message: "Upload failed." };
  }
  return { ok: true, publicUrl };
}
