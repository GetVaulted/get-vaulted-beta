import { describe, expect, it } from 'vitest';
import { deriveUpcomingHeroEvents } from './homeFeedDerivations';
import type { ScheduledStream } from '../types';

function ev(id: string, iso: string | null, startsAt: string): ScheduledStream {
  return { id, scheduledStartAtIso: iso, startsAt } as ScheduledStream;
}

describe('deriveUpcomingHeroEvents', () => {
  it('orders by the real ISO start — today on top, later shows descending', () => {
    const rows = [
      ev('nextWeek', '2026-07-24T20:00:00.000Z', 'Next week'),
      ev('today', '2026-07-17T18:00:00.000Z', 'Today'),
      ev('tomorrow', '2026-07-18T15:00:00.000Z', 'Tomorrow'),
    ];
    expect(deriveUpcomingHeroEvents(rows).map((r) => r.id)).toEqual([
      'today',
      'tomorrow',
      'nextWeek',
    ]);
  });

  it('ignores the human display string (startsAt) when ordering', () => {
    // startsAt sorts alphabetically to Aaa/Bbb/Ccc, but the ISO start is the reverse.
    const rows = [
      ev('a', '2026-07-19T00:00:00.000Z', 'Aaa'),
      ev('b', '2026-07-18T00:00:00.000Z', 'Bbb'),
      ev('c', '2026-07-17T00:00:00.000Z', 'Ccc'),
    ];
    expect(deriveUpcomingHeroEvents(rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('pushes shows with no ISO start time to the end', () => {
    const rows = [
      ev('tba', null, 'TBA'),
      ev('soon', '2026-07-17T18:00:00.000Z', 'Soon'),
    ];
    expect(deriveUpcomingHeroEvents(rows).map((r) => r.id)).toEqual(['soon', 'tba']);
  });
});
