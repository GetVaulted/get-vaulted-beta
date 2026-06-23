import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  peekCachedBuyerLiveStream,
  prefetchLiveStreamRooms,
  peekPrefetchedViewerStageToken,
} from './liveStreamPrefetchCache';

vi.mock('../api/liveRoomStreamRepository', () => ({
  fetchBuyerLiveStream: vi.fn(async (roomId: string) => ({
    playbackUrl: `https://example.com/${roomId}.m3u8`,
    streamHealth: 'live',
    streamPaused: false,
    streamStartedAt: null,
    streamEndedAt: null,
    lastStatusSyncAt: null,
    streamMode: 'stage_webrtc',
    stageAvailable: true,
  })),
  fetchViewerStageToken: vi.fn(async () => ({
    token: 'viewer-token',
    participantId: 'p1',
    stageArn: 'arn:stage',
    expiresInSeconds: 1200,
  })),
}));

describe('liveStreamPrefetchCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caches stream metadata after prefetch', async () => {
    prefetchLiveStreamRooms(['room_a'], 'token');
    await vi.waitFor(() => {
      expect(peekCachedBuyerLiveStream('room_a')?.streamHealth).toBe('live');
    });
  });

  it('skips stage token prefetch when buyers use HLS playback', async () => {
    prefetchLiveStreamRooms(['room_b'], 'token');
    await vi.waitFor(() => {
      expect(peekCachedBuyerLiveStream('room_b')?.streamHealth).toBe('live');
    });
    expect(peekPrefetchedViewerStageToken('room_b')).toBeNull();
  });
});
