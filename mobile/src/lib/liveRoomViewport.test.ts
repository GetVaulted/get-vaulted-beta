import { describe, expect, it } from 'vitest';
import {
  computeLiveStageContainer,
  computeLiveStageRootStyle,
  LIVE_STAGE_ASPECT,
  LIVE_STAGE_CONTENT_FIT,
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

  it('centers a phone-width 9:16 column on iPad instead of full-width cover', () => {
    const stage = computeLiveStageContainer(820, 1180);
    expect(stage.designWidth).toBe(430);
    expect(stage.designHeight).toBeCloseTo(430 / LIVE_STAGE_ASPECT, 3);
    expect(stage.uniformScale).toBe(1);
    expect(stage.layoutWidth).toBe(430);
    expect(stage.offsetLeft).toBe(195);
    expect(stage.offsetTop).toBeGreaterThan(0);
    expect(stage.designWidth / stage.designHeight).toBeCloseTo(LIVE_STAGE_ASPECT, 5);
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
