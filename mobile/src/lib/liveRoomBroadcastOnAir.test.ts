import { describe, expect, it } from 'vitest';
import { isLiveRoomRemotePublisherActive } from './liveRoomBroadcastOnAir';

describe('isLiveRoomRemotePublisherActive', () => {
  it('treats live health as a remote publisher', () => {
    expect(
      isLiveRoomRemotePublisherActive({
        status: 'live',
        streamHealth: 'live',
        streamPaused: false,
        streamMode: 'stage_webrtc',
      }),
    ).toBe(true);
  });

  it('does not treat connecting (waiting on host after kill) as a remote publisher', () => {
    expect(
      isLiveRoomRemotePublisherActive({
        status: 'live',
        streamHealth: 'connecting',
        streamPaused: false,
        streamMode: 'stage_webrtc',
      }),
    ).toBe(false);
  });

  it('does not treat offline / paused as a remote publisher', () => {
    expect(
      isLiveRoomRemotePublisherActive({
        status: 'live',
        streamHealth: 'offline',
        streamPaused: false,
        streamMode: 'stage_webrtc',
      }),
    ).toBe(false);
    expect(
      isLiveRoomRemotePublisherActive({
        status: 'live',
        streamHealth: 'live',
        streamPaused: true,
        streamMode: 'stage_webrtc',
      }),
    ).toBe(false);
  });
});
