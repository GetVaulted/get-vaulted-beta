import { describe, expect, it } from 'vitest';
import { isObsChannelHlsMode } from './liveObsChannelMode';

describe('isObsChannelHlsMode', () => {
  it('is true only for channel_hls', () => {
    expect(isObsChannelHlsMode('channel_hls')).toBe(true);
    expect(isObsChannelHlsMode('CHANNEL_HLS')).toBe(true);
    expect(isObsChannelHlsMode('stage_webrtc')).toBe(false);
    expect(isObsChannelHlsMode(null)).toBe(false);
    expect(isObsChannelHlsMode(undefined)).toBe(false);
  });
});
