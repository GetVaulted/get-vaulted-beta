import { describe, expect, it } from 'vitest';
import {
  computeLiveRoomCanvasStyle,
  computeLiveRoomUiMetrics,
  liveRoomCanvasInsets,
  liveRoomHudScale,
  LIVE_ROOM_REF_WIDTH,
} from './liveRoomUiScale';

const DEVICE = { fontScale: 1, pixelRatio: 3 };

describe('computeLiveRoomUiMetrics', () => {
  it('uses 430pt design canvas for the reference device width', () => {
    const metrics = computeLiveRoomUiMetrics(430, 932, DEVICE);
    expect(metrics.uniformScale).toBe(1);
    expect(metrics.canvasHeight).toBe(932);
    expect(metrics.refWidth).toBe(LIVE_ROOM_REF_WIDTH);
  });

  it('uniformly scales canvas for wider phones without changing design coordinates', () => {
    const metrics = computeLiveRoomUiMetrics(440, 956, DEVICE);
    expect(metrics.uniformScale).toBeCloseTo(440 / LIVE_ROOM_REF_WIDTH, 5);
    expect(metrics.canvasHeight * metrics.uniformScale).toBeCloseTo(956, 5);
  });

  it('counteracts display zoom by expanding the design canvas height', () => {
    const metrics = computeLiveRoomUiMetrics(393, 852, DEVICE);
    expect(metrics.uniformScale).toBeCloseTo(393 / LIVE_ROOM_REF_WIDTH, 5);
    expect(metrics.canvasHeight * metrics.uniformScale).toBeCloseTo(852, 5);
  });
});

describe('liveRoomCanvasInsets', () => {
  it('converts physical safe-area insets into canvas coordinates', () => {
    const metrics = computeLiveRoomUiMetrics(440, 956, DEVICE);
    const insets = liveRoomCanvasInsets(metrics, { top: 59, bottom: 34 });
    expect(insets.top).toBeCloseTo(59 / metrics.uniformScale, 5);
    expect(insets.bottom).toBeCloseTo(34 / metrics.uniformScale, 5);
  });
});

describe('liveRoomHudScale', () => {
  it('scales up overlays on iPad widths only', () => {
    expect(liveRoomHudScale(390)).toBeLessThanOrEqual(1);
    expect(liveRoomHudScale(768)).toBeGreaterThan(1.6);
    expect(liveRoomHudScale(1024)).toBeGreaterThan(1.7);
  });
});

describe('computeLiveRoomCanvasStyle', () => {
  it('anchors scaled canvas to the top-left', () => {
    const metrics = computeLiveRoomUiMetrics(440, 956, DEVICE);
    const style = computeLiveRoomCanvasStyle(metrics);
    expect(style.width).toBe(LIVE_ROOM_REF_WIDTH);
    expect(style.height).toBe(metrics.canvasHeight);
    expect(style.transform).toEqual([{ scale: metrics.uniformScale }]);
    expect(style.transformOrigin).toBe('top left');
  });
});
