/** Fraction of stage width the chrome slides off-screen (Whatnot-style). */
export const LIVE_IMMERSIVE_HIDE_RATIO = 0.94;

export const LIVE_IMMERSIVE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.85,
} as const;

export function computeLiveImmersiveHideDistance(stageWidth: number): number {
  return Math.max(1, stageWidth) * LIVE_IMMERSIVE_HIDE_RATIO;
}

/** @returns true when chrome should end hidden (immersive / clean video). */
export function resolveLiveImmersiveSnap(args: {
  translateX: number;
  hideDistance: number;
  velocityX: number;
  translationX: number;
  startedHidden: boolean;
}): boolean {
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
