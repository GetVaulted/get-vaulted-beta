/**
 * Neutral on-brand placeholder when a listing has no uploaded image.
 * Uses a local SVG so production QA is not tied to stock photography URLs.
 */

export type PhotoMode = "portrait" | "landscape" | "product";

/** `seed` and `mode` are kept for API compatibility with callers; both map to the same asset. */
export function getMarketplacePhotoUrl(_seed: string, _mode: PhotoMode): string {
  return "/placeholders/listing-visual.svg";
}
