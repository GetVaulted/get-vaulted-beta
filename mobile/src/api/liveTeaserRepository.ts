import { readAsStringAsync } from 'expo-file-system/legacy';
import { getSupabase } from '../lib/supabase';
import { LIVE_TEASER_MAX_BYTES } from '../lib/liveTeaserLimits';

/**
 * Same bucket as listing photos/videos (`listingMediaRepository.ts`) — proven to already accept
 * direct client uploads, including video, scoped by `${sellerId}/...` RLS. Teasers live under
 * their own path prefix within it so they never collide with listing media.
 */
const BUCKET = 'listing-media';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function teaserMimeFromUri(uri: string): string {
  return uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
}

function extFromTeaserMime(mime: string): string {
  return mime.includes('quicktime') ? 'mov' : 'mp4';
}

/**
 * Uploads a short scheduled-room teaser clip DIRECTLY to Supabase Storage from the device,
 * bypassing the `/api/uploads/live-teaser` Next.js route entirely.
 *
 * That route's server function has a request body size limit well below the app's own 40MB
 * teaser cap (confirmed via a real "Publish failed: Request failed (413)" error on genuine
 * uploads) — any teaser clip of a realistic size for its allowed 1–15s duration was rejected by
 * the hosting platform before ever reaching the route's own size/format validation. Routing the
 * bytes straight to Supabase Storage sidesteps that limit entirely, mirroring
 * `listingMediaRepository.ts`'s already-working direct-upload pattern for listing photos and
 * videos (same bucket family, same mechanism, already reliably handles video files this size).
 *
 * Trade-off: the server-side magic-byte / MIME sniffing that `/api/uploads/live-teaser` did is
 * no longer possible once bytes go straight to storage — this is the standard, expected
 * trade-off of a direct-to-storage upload. The client already independently checks duration and
 * file size before ever calling this (see `pickTeaser` in the caller), and the room API's own
 * `parseLiveTeaserFieldsFromBody` still validates the URL shape and duration server-side when
 * the room is created/updated with this teaser.
 */
export async function uploadLiveTeaserToSupabase(
  sellerId: string,
  localUri: string,
  durationMs: number,
): Promise<{ url: string; durationMs: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');

  const mime = teaserMimeFromUri(localUri);
  const ext = extFromTeaserMime(mime);
  const path = `${sellerId}/live-teasers/${Date.now()}.${ext}`;

  const base64 = await readAsStringAsync(localUri, { encoding: 'base64' });
  const body = base64ToArrayBuffer(base64);
  if (body.byteLength > LIVE_TEASER_MAX_BYTES) {
    throw new Error('Preview video must be 40MB or smaller.');
  }

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    const msg = upErr.message.toLowerCase();
    if (msg.includes('row-level security') || msg.includes('permission') || msg.includes('not authorized')) {
      throw new Error('Preview video upload denied — sign in again or check storage permissions.');
    }
    throw new Error(upErr.message || 'Could not upload preview video.');
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not resolve preview video URL.');
  return { url: data.publicUrl, durationMs: Math.round(durationMs) };
}
