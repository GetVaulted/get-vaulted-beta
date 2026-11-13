import { describe, expect, it } from 'vitest';
import {
  AGORA_HOST_VIDEO,
  agoraTokenRefreshDelayMs,
  agoraZoomStops,
  clampAgoraZoom,
  friendlyAgoraError,
  relayRetryDelayMs,
} from './agoraHost';

describe('agoraHost helpers', () => {
  it('sends portrait video', () => {
    expect(AGORA_HOST_VIDEO.height).toBeGreaterThan(AGORA_HOST_VIDEO.width);
  });

  it('offers zoom stops only the camera can reach', () => {
    expect(agoraZoomStops(1, true)).toEqual([1]);
    expect(agoraZoomStops(8, false)).toEqual([1]);
    expect(agoraZoomStops(NaN, true)).toEqual([1]);
    expect(agoraZoomStops(2.5, true)).toEqual([1, 2]);
    expect(agoraZoomStops(10, true)).toEqual([1, 2, 3, 5]);
  });

  it('clamps zoom into the supported range', () => {
    expect(clampAgoraZoom(0.5, 5)).toBe(1);
    expect(clampAgoraZoom(9, 5)).toBe(5);
    expect(clampAgoraZoom(2, 5)).toBe(2);
    expect(clampAgoraZoom(NaN, 5)).toBe(1);
    expect(clampAgoraZoom(3, NaN)).toBe(1);
  });

  it('backs off relay retries', () => {
    expect(relayRetryDelayMs(1)).toBe(1_500);
    expect(relayRetryDelayMs(3)).toBe(4_500);
    expect(relayRetryDelayMs(0)).toBe(1_500);
  });

  it('refreshes the token an hour before it lapses, never in the past', () => {
    expect(agoraTokenRefreshDelayMs(12 * 3600)).toBe(11 * 3600 * 1000);
    expect(agoraTokenRefreshDelayMs(30 * 60)).toBe(60_000);
    expect(agoraTokenRefreshDelayMs(0)).toBe(11 * 3600 * 1000);
  });

  it('turns permission failures into the camera message and keeps other messages', () => {
    expect(friendlyAgoraError(new Error('Permission denied'))).toMatch(/Camera and microphone access/);
    expect(friendlyAgoraError(new Error('Could not join live video (code -2).'))).toBe('Could not join live video (code -2).');
    expect(friendlyAgoraError('')).toBe('Could not start the live broadcast.');
  });
});
