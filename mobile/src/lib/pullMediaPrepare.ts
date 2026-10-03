import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Seller "Pulls" limits — mirrors `web/src/lib/profile-media-requirements.ts`.
 * No shared package between mobile/web in this repo, so these are a literal mirror —
 * keep both in sync if the numbers ever change.
 */
export const PULL_MEDIA_MAX_PHOTOS = 20;
export const PULL_MEDIA_MAX_VIDEOS = 5;
export const PULL_VIDEO_MAX_DURATION_MS = 20_000;
export const PULL_VIDEO_MAX_BYTES = 30 * 1024 * 1024;

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.82;

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Resize and JPEG-compress a local pull photo before upload — same profile as listing photos. */
export async function preparePullPhotoForUpload(uri: string): Promise<string> {
  if (isRemoteUri(uri)) return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export function validatePullVideoDurationMs(durationMs: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, error: 'Could not read this video’s length.' };
  }
  if (durationMs > PULL_VIDEO_MAX_DURATION_MS) {
    return { ok: false, error: 'Pull video must be 20 seconds or shorter.' };
  }
  return { ok: true };
}

export function validatePullVideoBytes(byteSize: number): { ok: true } | { ok: false; error: string } {
  if (byteSize > PULL_VIDEO_MAX_BYTES) {
    return { ok: false, error: 'Pull video must be 30MB or smaller.' };
  }
  return { ok: true };
}
