/** Lower bound for zoomable-image scale — the "reset"/unzoomed state. */
export const ZOOMABLE_IMAGE_MIN_SCALE = 1;

/** Upper bound for pinch-zoom scale. */
export const ZOOMABLE_IMAGE_MAX_SCALE = 5;

/** Scale applied when a double-tap zooms in from the rest state. */
export const ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE = 2.5;

/** Clamps a pinch scale to the allowed zoom range, guarding against NaN/Infinity from gesture math. */
export function clampScale(
  scale: number,
  min = ZOOMABLE_IMAGE_MIN_SCALE,
  max = ZOOMABLE_IMAGE_MAX_SCALE,
): number {
  'worklet';
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * Clamps a pan translation on one axis so the scaled image can't be dragged
 * further than its own overflow past the container edge.
 */
export function clampTranslation(translation: number, scale: number, containerSize: number): number {
  'worklet';
  if (!Number.isFinite(translation)) return 0;
  const maxOffset = Math.max(0, (containerSize * (scale - 1)) / 2);
  return Math.min(maxOffset, Math.max(-maxOffset, translation));
}

/** Toggles double-tap zoom: zoom in from rest, or reset back to rest if already zoomed in. */
export function nextDoubleTapScale(
  currentScale: number,
  zoomedScale = ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE,
  restScale = ZOOMABLE_IMAGE_MIN_SCALE,
): number {
  'worklet';
  return currentScale > restScale + 0.01 ? restScale : zoomedScale;
}
