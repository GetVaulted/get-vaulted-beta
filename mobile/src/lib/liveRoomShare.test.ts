import { describe, expect, it } from 'vitest';
import {
  buildLiveRoomShareMessage,
  buildLiveRoomShareText,
  buildSellerLiveShareMessage,
} from './liveRoomShare';
import { canonicalLiveShareUrl } from './liveShareUrl';
import type { LiveStream } from '../types';

const baseStream = {
  id: 'room-abc-123',
  title: 'Friday Night Break',
  host: { handle: '@vaultking', name: 'Vault King', avatarUrl: '', isVerified: false },
  roomStatus: 'live',
} as unknown as LiveStream;

describe('liveRoomShare', () => {
  it('builds canonical live show URL with show id', () => {
    expect(canonicalLiveShareUrl('room-abc-123')).toBe(
      'https://shopgetvaulted.com/live/room-abc-123',
    );
  });

  it('formats live share text with host, title, and url', () => {
    expect(
      buildLiveRoomShareText({
        hostUsername: 'vaultking',
        showTitle: 'Friday Night Break',
        url: 'https://shopgetvaulted.com/live/room-abc-123',
      }),
    ).toBe(
      'vaultking is LIVE on Get Vaulted — Friday Night Break. Join now: https://shopgetvaulted.com/live/room-abc-123',
    );
  });

  it('buildLiveRoomShareMessage includes full share line', () => {
    const { message, url } = buildLiveRoomShareMessage(baseStream);
    expect(url).toBe('https://shopgetvaulted.com/live/room-abc-123');
    expect(message).toContain('vaultking is LIVE on Get Vaulted');
    expect(message).toContain('Friday Night Break');
    expect(message).toContain(url!);
  });

  it('buildSellerLiveShareMessage matches buyer share format', () => {
    const { message } = buildSellerLiveShareMessage({
      hostUsername: 'vaultking',
      showTitle: 'Friday Night Break',
      publicUrl: 'https://shopgetvaulted.com/live/room-abc-123',
    });
    expect(message).toBe(
      'vaultking is LIVE on Get Vaulted — Friday Night Break. Join now: https://shopgetvaulted.com/live/room-abc-123',
    );
  });
});
