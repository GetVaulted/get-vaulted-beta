/** iPhone 15 Pro Max portrait logical width — live-room overlay design baseline. */
export { APP_REF_WIDTH as LIVE_ROOM_REF_WIDTH } from './appUiScale';
import { APP_REF_WIDTH, APP_TEXT_PROPS, appUniformScale } from './appUiScale';

/** Disable dynamic type inside live room only; app-wide accessibility stays unchanged. */
export const LIVE_ROOM_TEXT_PROPS = APP_TEXT_PROPS;

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

/** True on iPhone 15-class widths (~393pt) and smaller non-Pro phones. */
export function isCompactLiveRoomLayout(layoutWidth: number): boolean {
  return layoutWidth < 400;
}

/** Uniform HUD scale vs 430pt Pro Max baseline; clamped so Hold to Bid stays ≥44pt. */
export function liveRoomCompactScale(layoutWidth: number): number {
  return appUniformScale(layoutWidth);
}

/** True on iPad-class widths where commerce HUD should scale up (not shrink). */
export function isTabletLiveRoomLayout(layoutWidth: number): boolean {
  return layoutWidth >= 600;
}

/**
 * Buyer/seller commerce overlay scale — shrinks on small phones, grows on tablets
 * so text and CTAs stay legible on wide screens.
 */
export function liveRoomHudScale(layoutWidth: number): number {
  const safe = Math.max(1, layoutWidth);
  if (safe < 400) return liveRoomCompactScale(safe);
  if (safe >= 768) return Math.min(1.28, safe / APP_REF_WIDTH);
  if (safe >= 600) return Math.min(1.18, safe / APP_REF_WIDTH);
  return 1;
}

export function computeLiveRoomUiMetrics(
  layoutWidth: number,
  layoutHeight: number,
  device: LiveRoomDeviceMetrics,
): LiveRoomUiMetrics {
  const safeWidth = Math.max(1, layoutWidth);
  const safeHeight = Math.max(1, layoutHeight);
  const uniformScale = safeWidth / APP_REF_WIDTH;

  return {
    refWidth: APP_REF_WIDTH,
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
