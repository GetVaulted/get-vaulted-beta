import { describe, expect, it } from 'vitest';
import {
  computeGiveawaySideTabTop,
  computeLiveStageContainer,
  computeLiveStageRootStyle,
  computeLiveTopReserve,
  LIVE_STAGE_ASPECT,
  LIVE_STAGE_CONTENT_FIT,
  liveStageContentFitForStreamMode,
  liveStageContentFitForPlayback,
} from './liveRoomViewport';

describe('computeLiveStageContainer', () => {
  it('builds a width-first 9:16 frame', () => {
    const stage = computeLiveStageContainer(430, 932);
    expect(stage.designWidth).toBe(430);
    expect(stage.designWidth / stage.designHeight).toBeCloseTo(LIVE_STAGE_ASPECT, 5);
    expect(LIVE_STAGE_CONTENT_FIT).toBe('cover');
  });

  it('letterboxes vertically when the viewport is taller than 9:16', () => {
    const stage = computeLiveStageContainer(430, 932);
    expect(stage.uniformScale).toBe(1);
    expect(stage.layoutHeight).toBe(stage.designHeight);
    expect(stage.offsetTop).toBeGreaterThan(0);
    expect(stage.offsetLeft).toBe(0);
  });

  it('uses contain for OBS/HLS and cover for phone Stage', () => {
    expect(liveStageContentFitForStreamMode('channel_hls')).toBe('contain');
    expect(liveStageContentFitForStreamMode('stage_webrtc')).toBe('cover');
    expect(liveStageContentFitForStreamMode(null)).toBe('cover');
  });

  it('uses contain for Stage→HLS mirrors even when streamMode is still stage_webrtc', () => {
    expect(
      liveStageContentFitForPlayback({ streamMode: 'stage_webrtc', transport: 'hls' }),
    ).toBe('contain');
    expect(
      liveStageContentFitForPlayback({ streamMode: 'stage_webrtc', transport: 'webrtc' }),
    ).toBe('cover');
    expect(
      liveStageContentFitForPlayback({ streamMode: 'channel_hls', transport: 'hls' }),
    ).toBe('contain');
  });

  // Regression: a PC seller broadcasting OBS 30+ straight into the Stage over WHIP reports
  // transport "webrtc" and streamMode "stage_webrtc" — indistinguishable from a phone's portrait
  // camera by those two fields alone — but the capture is OBS's landscape canvas, so buyers saw
  // it cropped/zoomed under `cover`. `isObsDesktopSource` (server-derived from the WHIP ingest
  // endpoint) must force `contain` regardless of streamMode/transport.
  it('uses contain for desktop OBS over WHIP into the Stage even though transport is webrtc', () => {
    expect(
      liveStageContentFitForPlayback({
        streamMode: 'stage_webrtc',
        transport: 'webrtc',
        isObsDesktopSource: true,
      }),
    ).toBe('contain');
    expect(
      liveStageContentFitForPlayback({
        streamMode: 'stage_webrtc',
        transport: 'webrtc',
        isObsDesktopSource: false,
      }),
    ).toBe('cover');
  });

  it('scales uniformly and centers horizontally when the frame exceeds viewport height', () => {
    const stage = computeLiveStageContainer(430, 700);
    expect(stage.uniformScale).toBeLessThan(1);
    expect(stage.layoutHeight).toBe(700);
    expect(stage.layoutWidth).toBeCloseTo(430 * stage.uniformScale, 3);
    expect(stage.offsetTop).toBe(0);
    expect(stage.offsetLeft).toBeGreaterThan(0);
  });

  it('matches proportions across Pro Max widths when height fits', () => {
    const a = computeLiveStageContainer(430, 932);
    const b = computeLiveStageContainer(440, 956);
    expect(a.uniformScale).toBe(1);
    expect(b.uniformScale).toBe(1);
    expect(a.designWidth / a.designHeight).toBeCloseTo(b.designWidth / b.designHeight, 5);
  });

  it('uses full viewport width on iPad and scales when the 9:16 frame exceeds height', () => {
    const stage = computeLiveStageContainer(820, 1180);
    expect(stage.designWidth).toBe(820);
    expect(stage.designHeight).toBeCloseTo(820 / LIVE_STAGE_ASPECT, 3);
    expect(stage.uniformScale).toBeCloseTo(1180 / stage.designHeight, 5);
    expect(stage.layoutHeight).toBe(1180);
    expect(stage.layoutWidth).toBeCloseTo(820 * stage.uniformScale, 3);
    expect(stage.offsetTop).toBe(0);
    expect(stage.offsetLeft).toBeGreaterThan(0);
    expect(stage.designWidth / stage.designHeight).toBeCloseTo(LIVE_STAGE_ASPECT, 5);
  });

  it('letterboxes vertically on tall iPad viewports when 9:16 fits', () => {
    const stage = computeLiveStageContainer(820, 1600);
    expect(stage.designWidth).toBe(820);
    expect(stage.uniformScale).toBe(1);
    expect(stage.layoutWidth).toBe(820);
    expect(stage.offsetLeft).toBe(0);
    expect(stage.offsetTop).toBeGreaterThan(0);
  });
});

describe('computeGiveawaySideTabTop', () => {
  it('sits just below the live top chrome reserve', () => {
    expect(computeGiveawaySideTabTop(59, 390)).toBe(computeLiveTopReserve(59, 390) + 4);
  });
});

describe('computeLiveStageRootStyle', () => {
  it('uses design dimensions with top-left scale origin', () => {
    const stage = computeLiveStageContainer(430, 700);
    const style = computeLiveStageRootStyle(stage);
    expect(style.width).toBe(430);
    expect(style.height).toBe(stage.designHeight);
    expect(style.transform).toEqual([{ scale: stage.uniformScale }]);
    expect(style.transformOrigin).toBe('top left');
  });
});
