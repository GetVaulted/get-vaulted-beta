import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchBuyerLiveStream } from '../api/liveRoomStreamRepository';
import {
  clearLiveStreamPrefetchCache,
  invalidateBuyerLiveStreamCache,
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
    vi.mocked(fetchBuyerLiveStream).mockResolvedValueOnce({
      playbackUrl: 'https://example.com/room_b.m3u8',
      streamHealth: 'live',
      streamPaused: false,
      streamStartedAt: null,
      streamEndedAt: null,
      lastStatusSyncAt: null,
      streamMode: 'channel_hls',
      stageAvailable: false,
    });
    prefetchLiveStreamRooms(['room_b'], 'token');
    await vi.waitFor(() => {
      expect(peekCachedBuyerLiveStream('room_b')?.streamHealth).toBe('live');
    });
    expect(peekPrefetchedViewerStageToken('room_b')).toBeNull();
  });

  it('clearLiveStreamPrefetchCache wipes cached stream metadata and stage tokens (cross-account safety)', async () => {
    prefetchLiveStreamRooms(['room_c'], 'token');
    await vi.waitFor(() => {
      expect(peekCachedBuyerLiveStream('room_c')?.streamHealth).toBe('live');
    });

    clearLiveStreamPrefetchCache();

    expect(peekCachedBuyerLiveStream('room_c')).toBeNull();
    expect(peekPrefetchedViewerStageToken('room_c')).toBeNull();
  });

  it('invalidateBuyerLiveStreamCache drops stale pause/resume metadata for hard refresh', async () => {
    prefetchLiveStreamRooms(['room_pause'], 'token');
    await vi.waitFor(() => {
      expect(peekCachedBuyerLiveStream('room_pause')?.streamPaused).toBe(false);
    });

    invalidateBuyerLiveStreamCache('room_pause');

    expect(peekCachedBuyerLiveStream('room_pause')).toBeNull();
  });
});
