import { describe, expect, it } from 'vitest';
import {
  orderScheduledStreamsByStartTime,
  stabilizeLiveDiscoveryOrder,
  type OrderedLiveRoom,
} from './liveDiscoveryOrder';
import type { LiveStream } from '../types';

type Row = { id: string; scheduledStartAtIso?: string | null };

describe('orderScheduledStreamsByStartTime', () => {
  it('orders upcoming shows soonest-first (today on top, later shows below)', () => {
    const today = '2026-07-17T18:00:00.000Z';
    const tomorrow = '2026-07-18T15:00:00.000Z';
    const nextWeek = '2026-07-24T20:00:00.000Z';
    const rows: Row[] = [
      { id: 'nextWeek', scheduledStartAtIso: nextWeek },
      { id: 'today', scheduledStartAtIso: today },
      { id: 'tomorrow', scheduledStartAtIso: tomorrow },
    ];
    expect(orderScheduledStreamsByStartTime(rows).map((r) => r.id)).toEqual([
      'today',
      'tomorrow',
      'nextWeek',
    ]);
  });

  it('pushes shows with no/invalid start time to the bottom', () => {
    const rows: Row[] = [
      { id: 'tba', scheduledStartAtIso: null },
      { id: 'soon', scheduledStartAtIso: '2026-07-17T18:00:00.000Z' },
      { id: 'garbage', scheduledStartAtIso: 'not-a-date' },
    ];
    expect(orderScheduledStreamsByStartTime(rows).map((r) => r.id)).toEqual([
      'soon',
      'tba',
      'garbage',
    ]);
  });

  it('is stable for equal start times', () => {
    const same = '2026-07-17T18:00:00.000Z';
    const rows: Row[] = [
      { id: 'a', scheduledStartAtIso: same },
      { id: 'b', scheduledStartAtIso: same },
      { id: 'c', scheduledStartAtIso: same },
    ];
    expect(orderScheduledStreamsByStartTime(rows).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const rows: Row[] = [
      { id: 'later', scheduledStartAtIso: '2026-07-18T15:00:00.000Z' },
      { id: 'earlier', scheduledStartAtIso: '2026-07-17T18:00:00.000Z' },
    ];
    const before = rows.map((r) => r.id);
    orderScheduledStreamsByStartTime(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

function room(id: string, viewers: number): OrderedLiveRoom {
  return { stream: { id, viewers } as LiveStream, promoBadge: undefined };
}

describe('stabilizeLiveDiscoveryOrder', () => {
  it('uses the fresh viewer-sorted order on first load (no previous order)', () => {
    const fresh = [room('a', 100), room('b', 50), room('c', 10)];
    const { result, nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, null);
    expect(nextOrderIds).toEqual(['a', 'b', 'c']);
    expect(result).toBe(fresh);
  });

  it('regression: keeps existing card positions when only viewer counts change', () => {
    // b now out-viewing a — a naive re-sort would swap their positions mid-scroll.
    const fresh = [room('b', 500), room('a', 100), room('c', 10)];
    const { result, nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, ['a', 'b', 'c']);
    expect(nextOrderIds).toEqual(['a', 'b', 'c']);
    // Position is frozen, but the room's own data (viewer count) is still fresh.
    expect(result.find((r) => r.stream.id === 'b')?.stream.viewers).toBe(500);
  });

  it('drops a room that is no longer present, preserving the rest of the order', () => {
    const fresh = [room('a', 100), room('c', 10)]; // b ended
    const { result, nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, ['a', 'b', 'c']);
    expect(nextOrderIds).toEqual(['a', 'c']);
    expect(result.map((r) => r.stream.id)).toEqual(['a', 'c']);
  });

  it('appends a brand-new room at the end even with a high viewer count', () => {
    const fresh = [room('d', 9999), room('a', 100), room('b', 50), room('c', 10)];
    const { nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, ['a', 'b', 'c']);
    expect(nextOrderIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('appends multiple newcomers in their own sorted order', () => {
    const fresh = [room('a', 5), room('e', 20), room('f', 80)];
    const { nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, ['a']);
    expect(nextOrderIds).toEqual(['a', 'e', 'f']);
  });

  it('treats an empty previous order the same as no previous order', () => {
    const fresh = [room('a', 1)];
    const { nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, []);
    expect(nextOrderIds).toEqual(['a']);
  });
});
