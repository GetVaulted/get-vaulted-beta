import { describe, expect, it } from 'vitest';
import { formatLiveDiscoveryProbeLine } from './liveDiscoveryProbeRepository';

describe('formatLiveDiscoveryProbeLine', () => {
  it('returns null for missing probe', () => {
    expect(formatLiveDiscoveryProbeLine(null)).toBeNull();
  });

  it('formats partial probe safely', () => {
    expect(
      formatLiveDiscoveryProbeLine({
        health: { url: '', status: 404, ok: false, snippet: '', json: null },
        rooms: { url: '', status: 403, ok: false, snippet: '', json: null },
      }),
    ).toContain('health 404 · rooms 403');
  });
});
