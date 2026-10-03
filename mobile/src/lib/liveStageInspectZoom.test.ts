import { describe, expect, it } from 'vitest';
import {
  clampLiveStageInspectScale,
  clampLiveStageInspectTranslation,
  isLiveStageInspectZoomActive,
  LIVE_STAGE_INSPECT_MAX_SCALE,
  LIVE_STAGE_INSPECT_MIN_SCALE,
} from './liveStageInspectZoom';

describe('liveStageInspectZoom', () => {
  it('clamps pinch scale between rest and max', () => {
    expect(clampLiveStageInspectScale(0.5)).toBe(LIVE_STAGE_INSPECT_MIN_SCALE);
    expect(clampLiveStageInspectScale(2.25)).toBe(2.25);
    expect(clampLiveStageInspectScale(99)).toBe(LIVE_STAGE_INSPECT_MAX_SCALE);
  });

  it('limits pan to scaled overflow', () => {
    expect(clampLiveStageInspectTranslation(500, 1, 400)).toBe(0);
    expect(clampLiveStageInspectTranslation(500, 2, 400)).toBe(200);
    expect(clampLiveStageInspectTranslation(-500, 2, 400)).toBe(-200);
  });

  it('treats only above-rest scale as active inspect', () => {
    expect(isLiveStageInspectZoomActive(1)).toBe(false);
    expect(isLiveStageInspectZoomActive(1.01)).toBe(false);
    expect(isLiveStageInspectZoomActive(1.5)).toBe(true);
  });
});
