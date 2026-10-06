import { describe, expect, it } from 'vitest';
import { formatIvsObsIngestUrl } from './ivsObsIngestUrl';

describe('formatIvsObsIngestUrl', () => {
  it('wraps a bare IVS ingest host for OBS', () => {
    expect(formatIvsObsIngestUrl('d94190052cca.global-contribute.live-video.net')).toBe(
      'rtmps://d94190052cca.global-contribute.live-video.net:443/app/',
    );
  });

  it('is idempotent for a full OBS URL', () => {
    const full = 'rtmps://d94190052cca.global-contribute.live-video.net:443/app/';
    expect(formatIvsObsIngestUrl(full)).toBe(full);
  });
});
