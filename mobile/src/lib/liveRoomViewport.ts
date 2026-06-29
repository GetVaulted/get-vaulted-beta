/** Portrait live stage aspect (width / height). */
export const LIVE_STAGE_ASPECT = 9 / 16;

/** Video/image fills the 9:16 frame — never the full screen. */
export const LIVE_STAGE_CONTENT_FIT = 'cover' as const;

export type LiveStageContainer = {
  /** Unscaled 9:16 frame width (always matches viewport width). */
  designWidth: number;
  /** Unscaled 9:16 frame height (= designWidth × 16/9). */
  designHeight: number;
  /** Uniform downscale when the 9:16 frame is taller than the viewport. */
  uniformScale: number;
  /** Scaled width on screen. */
  layoutWidth: number;
  /** Scaled height on screen. */
  layoutHeight: number;
  /** Horizontal offset when height-scaled and centered. */
  offsetLeft: number;
  /** Vertical offset when letterboxed (stage shorter than viewport). */
  offsetTop: number;
};

/**
 * True 9:16 live stage at full viewport width on every device.
 * Letterbox vertically when the viewport is taller; scale uniformly when shorter.
 */
export function computeLiveStageContainer(
  screenWidth: number,
  screenHeight: number,
): LiveStageContainer {
  const sw = Math.max(1, screenWidth);
  const sh = Math.max(1, screenHeight);

  const designWidth = sw;
  const designHeight = designWidth / LIVE_STAGE_ASPECT;

  if (designHeight <= sh) {
    return {
      designWidth,
      designHeight,
      uniformScale: 1,
      layoutWidth: designWidth,
      layoutHeight: designHeight,
      offsetLeft: 0,
      offsetTop: (sh - designHeight) / 2,
    };
  }

  const uniformScale = sh / designHeight;
  const layoutWidth = designWidth * uniformScale;
  const layoutHeight = sh;

  return {
    designWidth,
    designHeight,
    uniformScale,
    layoutWidth,
    layoutHeight,
    offsetLeft: (designWidth - layoutWidth) / 2,
    offsetTop: 0,
  };
}

/** Position the stage host within the screen viewport. */
export function computeLiveStageHostStyle(stage: LiveStageContainer) {
  return {
    position: 'absolute' as const,
    left: stage.offsetLeft,
    top: stage.offsetTop,
    width: stage.layoutWidth,
    height: stage.layoutHeight,
    overflow: 'hidden' as const,
  };
}

/** Inner 9:16 root — design coordinates; uniform scale maps to host size. */
export function computeLiveStageRootStyle(stage: LiveStageContainer) {
  return {
    width: stage.designWidth,
    height: stage.designHeight,
    transform: [{ scale: stage.uniformScale }],
    transformOrigin: 'top left' as const,
  };
}

/** Safe-area padding inside the stage (design coordinates). */
export function computeLiveStageSafeInsets(
  stage: LiveStageContainer,
  screenHeight: number,
  insets: { top: number; bottom: number },
  dockPadding = 8,
): { top: number; bottom: number } {
  const scale = Math.max(0.001, stage.uniformScale);
  const stageBottomOnScreen = stage.offsetTop + stage.layoutHeight;
  const letterboxBelow = screenHeight - stageBottomOnScreen;

  const top =
    stage.offsetTop >= insets.top
      ? dockPadding
      : Math.max(dockPadding, (insets.top - stage.offsetTop) / scale + dockPadding);

  const bottom =
    letterboxBelow >= insets.bottom
      ? dockPadding
      : insets.bottom / scale + dockPadding;

  return { top, bottom };
}

/** Header overlays the stage; reserve safe-area + compact header for chat cap. */
export function computeLiveTopReserve(topInset: number, layoutWidth?: number): number {
  const compact = layoutWidth != null && layoutWidth < 400;
  return topInset + (compact ? 62 : 72);
}

/** Left-edge giveaway tab sits flush under the live room top chrome. */
export function computeGiveawaySideTabTop(topInset: number, layoutWidth?: number): number {
  return computeLiveTopReserve(topInset, layoutWidth) + 4;
}

export type LiveStageLayoutDebug = {
  roomId: string;
  screenWidth: number;
  screenHeight: number;
  designWidth: number;
  designHeight: number;
  uniformScale: number;
  layoutWidth: number;
  layoutHeight: number;
  offsetLeft: number;
  offsetTop: number;
  contentFit: typeof LIVE_STAGE_CONTENT_FIT;
  resizeMode: typeof LIVE_STAGE_CONTENT_FIT;
  objectFit: typeof LIVE_STAGE_CONTENT_FIT;
};

export function logLiveStageLayoutDebug(
  payload: Omit<LiveStageLayoutDebug, 'resizeMode' | 'objectFit'>,
): void {
  if (!__DEV__) return;
  const row: LiveStageLayoutDebug = {
    ...payload,
    resizeMode: payload.contentFit,
    objectFit: payload.contentFit,
  };
  console.log('[LiveStageLayout]', JSON.stringify(row, null, 2));
}
