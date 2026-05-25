/** iPhone 15 Pro Max portrait logical width — live-room overlay design baseline. */
export const LIVE_ROOM_REF_WIDTH = 430;

/** Disable dynamic type inside live room only; app-wide accessibility stays unchanged. */
export const LIVE_ROOM_TEXT_PROPS = {
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
} as const;

export type LiveRoomDeviceMetrics = {
  fontScale: number;
  pixelRatio: number;
};

export type LiveRoomUiMetrics = LiveRoomDeviceMetrics & {
  refWidth: number;
  layoutWidth: number;
  layoutHeight: number;
  /** Maps design canvas (ref width) to the measured viewport width. */
  uniformScale: number;
  /** Inner canvas height before uniform scale is applied. */
  canvasHeight: number;
};

export function computeLiveRoomUiMetrics(
  layoutWidth: number,
  layoutHeight: number,
  device: LiveRoomDeviceMetrics,
): LiveRoomUiMetrics {
  const safeWidth = Math.max(1, layoutWidth);
  const safeHeight = Math.max(1, layoutHeight);
  const uniformScale = safeWidth / LIVE_ROOM_REF_WIDTH;

  return {
    refWidth: LIVE_ROOM_REF_WIDTH,
    layoutWidth: safeWidth,
    layoutHeight: safeHeight,
    uniformScale,
    canvasHeight: safeHeight / uniformScale,
    fontScale: device.fontScale,
    pixelRatio: device.pixelRatio,
  };
}

export function computeLiveRoomCanvasStyle(metrics: LiveRoomUiMetrics) {
  return {
    width: metrics.refWidth,
    height: metrics.canvasHeight,
    transform: [{ scale: metrics.uniformScale }],
    transformOrigin: 'top left' as const,
  };
}

export function liveRoomCanvasInsets(
  metrics: LiveRoomUiMetrics,
  insets: { top: number; bottom: number },
): { top: number; bottom: number } {
  const scale = Math.max(0.01, metrics.uniformScale);
  return {
    top: insets.top / scale,
    bottom: insets.bottom / scale,
  };
}

export type LiveRoomUiScaleDebug = {
  roomId: string;
  refWidth: number;
  layoutWidth: number;
  layoutHeight: number;
  uniformScale: number;
  canvasHeight: number;
  fontScale: number;
  pixelRatio: number;
};

export function logLiveRoomUiScaleDebug(payload: LiveRoomUiScaleDebug): void {
  if (!__DEV__) return;
  console.log('[LiveRoomUiScale]', JSON.stringify(payload, null, 2));
}
