import { describe, expect, it } from 'vitest';
import { isObsDesktopBroadcastMode } from './liveObsChannelMode';

describe('isObsDesktopBroadcastMode with a phone relay', () => {
  it('treats a relayed phone camera as a phone, not OBS', () => {
    expect(isObsDesktopBroadcastMode({ streamMode: 'channel_hls', phoneRelay: true })).toBe(false);
  });

  it('still treats plain HLS ingest as OBS', () => {
    expect(isObsDesktopBroadcastMode({ streamMode: 'channel_hls' })).toBe(true);
    expect(isObsDesktopBroadcastMode({ streamMode: 'channel_hls', phoneRelay: false })).toBe(true);
  });

  it('leaves the AWS Stage path alone', () => {
    expect(isObsDesktopBroadcastMode({ streamMode: 'stage_webrtc', ingestEndpoint: 'rtmps://x' })).toBe(false);
  });
});
