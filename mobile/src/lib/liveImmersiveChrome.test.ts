import { describe, expect, it } from 'vitest';
import {
  computeLiveImmersiveHideDistance,
  LIVE_IMMERSIVE_HIDE_RATIO,
  resolveLiveImmersiveSnap,
} from './liveImmersiveChrome';

describe('computeLiveImmersiveHideDistance', () => {
  it('scales hide distance with stage width', () => {
    expect(computeLiveImmersiveHideDistance(430)).toBeCloseTo(430 * LIVE_IMMERSIVE_HIDE_RATIO, 5);
  });
});

describe('resolveLiveImmersiveSnap', () => {
  const hideDistance = 400;

  it('snaps open when swipe started visible and user flings left', () => {
    expect(
      resolveLiveImmersiveSnap({
        translateX: -120,
        hideDistance,
        velocityX: -600,
        translationX: -80,
        startedHidden: false,
      }),
    ).toBe(true);
  });

  it('stays open when swipe started visible and movement is small', () => {
    expect(
      resolveLiveImmersiveSnap({
        translateX: -30,
        hideDistance,
        velocityX: 0,
        translationX: -30,
        startedHidden: false,
      }),
    ).toBe(false);
  });

  it('restores chrome when swipe started hidden and user flings right', () => {
    expect(
      resolveLiveImmersiveSnap({
        translateX: -320,
        hideDistance,
        velocityX: 520,
        translationX: 90,
        startedHidden: true,
      }),
    ).toBe(false);
  });

  it('stays hidden when swipe started hidden and release is past midpoint', () => {
    expect(
      resolveLiveImmersiveSnap({
        translateX: -300,
        hideDistance,
        velocityX: 0,
        translationX: 20,
        startedHidden: true,
      }),
    ).toBe(true);
  });
});
