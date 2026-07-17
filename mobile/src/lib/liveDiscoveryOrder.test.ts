import { describe, expect, it } from 'vitest';
import { orderScheduledStreamsByStartTime } from './liveDiscoveryOrder';

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
