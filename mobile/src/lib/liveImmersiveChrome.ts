/** Full stage width plus bleed so rails, shadows, and chat never peek at the edge. */
export const LIVE_IMMERSIVE_HIDE_RATIO = 1;

/** Extra slide distance (design px) past the stage edge for glow / shadow bleed. */
export const LIVE_IMMERSIVE_HIDE_BLEED_PX = 64;

export const LIVE_IMMERSIVE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.85,
} as const;

export function computeLiveImmersiveHideDistance(stageWidth: number): number {
  return Math.max(1, stageWidth) * LIVE_IMMERSIVE_HIDE_RATIO + LIVE_IMMERSIVE_HIDE_BLEED_PX;
}

/** @returns true when chrome should end hidden (immersive / clean video). */
export function resolveLiveImmersiveSnap(args: {
  translateX: number;
  hideDistance: number;
  velocityX: number;
  translationX: number;
  startedHidden: boolean;
}): boolean {
  'worklet';
  const { translateX, hideDistance, velocityX, translationX, startedHidden } = args;
  const hiddenProgress = Math.abs(translateX) / Math.max(1, hideDistance);

  if (startedHidden) {
    if (velocityX > 450 || translationX > 36) return false;
    if (velocityX < -450) return true;
    return hiddenProgress > 0.42;
  }

  if (velocityX < -450 || translationX < -36) return true;
  if (velocityX > 450) return false;
  return hiddenProgress > 0.38;
}
