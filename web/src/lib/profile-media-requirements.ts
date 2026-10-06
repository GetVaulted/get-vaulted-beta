/**
 * Seller "Pulls" gallery limits — photos/short clips attached to a seller's profile
 * (not to any listing). Mirrors the shape of `listing-photo-requirements.ts` / `hit-clip.ts`.
 * Mobile keeps a literal mirror of these numbers in `mobile/src/lib/pullMediaPrepare.ts`
 * (no shared package between the two apps) — keep both in sync if these ever change.
 */
export const PULL_MEDIA_MAX_PHOTOS = 20;
export const PULL_MEDIA_MAX_VIDEOS = 5;
export const PULL_VIDEO_MIN_DURATION_MS = 1_000;
export const PULL_VIDEO_MAX_DURATION_MS = 20_000;
export const PULL_VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const PULL_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export const PULL_COMMENT_MAX_LENGTH = 500;

export function validatePullPhotoCount(existingCount: number): { ok: true } | { ok: false; error: string } {
  if (existingCount >= PULL_MEDIA_MAX_PHOTOS) {
    return { ok: false, error: `You can upload up to ${PULL_MEDIA_MAX_PHOTOS} pull photos.` };
  }
  return { ok: true };
}

export function validatePullVideoCount(existingCount: number): { ok: true } | { ok: false; error: string } {
  if (existingCount >= PULL_MEDIA_MAX_VIDEOS) {
    return { ok: false, error: `You can upload up to ${PULL_MEDIA_MAX_VIDEOS} pull videos.` };
  }
  return { ok: true };
}

export function validatePullVideoDurationMs(durationMs: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(durationMs) || durationMs < PULL_VIDEO_MIN_DURATION_MS) {
    return { ok: false, error: "Pull video must be at least 1 second." };
  }
  if (durationMs > PULL_VIDEO_MAX_DURATION_MS) {
    return { ok: false, error: "Pull video must be 20 seconds or shorter." };
  }
  return { ok: true };
}

export function validatePullVideoBytes(byteSize: number): { ok: true } | { ok: false; error: string } {
  if (byteSize > PULL_VIDEO_MAX_BYTES) {
    return { ok: false, error: "Pull video must be 30MB or smaller." };
  }
  return { ok: true };
}

export function validatePullCommentBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) {
    return { ok: false, error: "Comment cannot be empty." };
  }
  if (body.length > PULL_COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Comment must be ${PULL_COMMENT_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, body };
}
