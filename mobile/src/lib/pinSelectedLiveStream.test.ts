import { describe, expect, it } from 'vitest';
import {
  mergeLiveFeedStreams,
  pinSelectedLiveStream,
  resolveLiveFeedPageCorrection,
} from './pinSelectedLiveStream';
import type { LiveStream } from '../types';

function stream(id: string, title = id): LiveStream {
  return { id, title } as LiveStream;
}

describe('pinSelectedLiveStream', () => {
  it('moves the selected room to index 0', () => {
    const list = [stream('a'), stream('b'), stream('c')];
    expect(pinSelectedLiveStream(list, 'b').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op when already first or missing', () => {
    const list = [stream('a'), stream('b')];
    expect(pinSelectedLiveStream(list, 'a')).toBe(list);
    expect(pinSelectedLiveStream(list, 'z')).toBe(list);
  });
});

describe('mergeLiveFeedStreams', () => {
  it('preserves current order and updates rows in place', () => {
    const prev = [stream('b'), stream('a'), stream('c')];
    const next = [stream('a', 'A2'), stream('c', 'C2'), stream('b', 'B2'), stream('d')];
    const merged = mergeLiveFeedStreams(prev, next);
    expect(merged.map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(merged[0]?.title).toBe('B2');
  });

  it('drops rooms that left discovery while keeping survivors stable', () => {
    const prev = [stream('a'), stream('b'), stream('c')];
    const next = [stream('c'), stream('a')];
    expect(mergeLiveFeedStreams(prev, next).map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('resolveLiveFeedPageCorrection', () => {
  it('returns null when the current page already shows the kept room', () => {
    expect(
      resolveLiveFeedPageCorrection({
        streams: [stream('a'), stream('b')],
        currentPage: 1,
        keepStreamId: 'b',
      }),
    ).toBeNull();
  });

  it('returns the new index when reorder left the wrong room on the current page', () => {
    expect(
      resolveLiveFeedPageCorrection({
        streams: [stream('c'), stream('a'), stream('b')],
        currentPage: 1,
        keepStreamId: 'b',
      }),
    ).toBe(2);
  });

  it('returns null when the kept room left the list (do not jump to a random show)', () => {
    expect(
      resolveLiveFeedPageCorrection({
        streams: [stream('a'), stream('c')],
        currentPage: 1,
        keepStreamId: 'b',
      }),
    ).toBeNull();
  });
});
