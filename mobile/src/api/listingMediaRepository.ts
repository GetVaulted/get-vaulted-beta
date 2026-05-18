import { readAsStringAsync } from 'expo-file-system/legacy';
import { LISTING_MIN_PHOTOS, type ListingMediaItem } from '../createListing/types';
import { getSupabase } from '../lib/supabase';

const BUCKET = 'listing-media';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function mimeFromUri(uri: string, kind: ListingMediaItem['kind']): string {
  const lower = uri.toLowerCase();
  if (kind === 'video' || lower.endsWith('.mp4') || lower.endsWith('.mov')) {
    return lower.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  }
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('video')) return 'mp4';
  return 'jpg';
}

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

async function uploadLocalFile(
  sellerId: string,
  uri: string,
  mime: string,
  index: number,
): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');

  const ext = extFromMime(mime);
  const path = `${sellerId}/listings/${Date.now()}-${index}.${ext}`;
  const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
  const body = base64ToArrayBuffer(base64);

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not resolve listing media URL');
  return data.publicUrl;
}

/**
 * Uploads local photos/videos to `listing-media` and returns public URLs in order.
 * Remote URLs are passed through unchanged.
 */
export async function uploadListingMediaForPublish(
  sellerId: string,
  media: ListingMediaItem[],
): Promise<string[]> {
  const photos = media.filter((m) => m.kind === 'photo');
  if (photos.length < LISTING_MIN_PHOTOS) {
    throw new Error(`Add at least ${LISTING_MIN_PHOTOS} photos before publishing.`);
  }

  const urls: string[] = [];

  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    if (isRemoteUrl(item.uri)) {
      urls.push(item.uri);
      continue;
    }

    const mime = mimeFromUri(item.uri, item.kind);
    urls.push(await uploadLocalFile(sellerId, item.uri, mime, index));
  }

  let uploadedPhotos = 0;
  for (let i = 0; i < media.length; i++) {
    if (media[i].kind === 'photo' && urls[i]) uploadedPhotos += 1;
  }
  if (uploadedPhotos < LISTING_MIN_PHOTOS) {
    throw new Error('Photo upload failed — check your connection and try again.');
  }

  return urls;
}
