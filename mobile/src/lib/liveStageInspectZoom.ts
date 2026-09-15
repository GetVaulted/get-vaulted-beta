import { clampScale, clampTranslation } from './zoomableImage';

/** Rest / unzoomed live stage scale. */
export const LIVE_STAGE_INSPECT_MIN_SCALE = 1;

/** Upper bound for temporary pinch-inspect on the live stage. */
export const LIVE_STAGE_INSPECT_MAX_SCALE = 5;

export const LIVE_STAGE_INSPECT_SPRING = {
  damping: 28,
  stiffness: 320,
  mass: 0.8,
} as const;

export function clampLiveStageInspectScale(scale: number): number {
  'worklet';
  return clampScale(scale, LIVE_STAGE_INSPECT_MIN_SCALE, LIVE_STAGE_INSPECT_MAX_SCALE);
}

export function clampLiveStageInspectTranslation(
  translation: number,
  scale: number,
  containerSize: number,
): number {
  'worklet';
  return clampTranslation(translation, scale, containerSize);
}

/** True while the buyer is mid inspect-zoom (scale above rest). */
export function isLiveStageInspectZoomActive(scale: number, epsilon = 0.02): boolean {
  'worklet';
  return scale > LIVE_STAGE_INSPECT_MIN_SCALE + epsilon;
}
