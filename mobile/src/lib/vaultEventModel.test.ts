import { describe, expect, it } from 'vitest';
import type { LiveRoomApiRow } from '../api/liveRoomsRepository';
import { vaultEventDisplayStatus, vaultEventSection, canCancelVaultEvent, primaryCta } from './vaultEventModel';

function room(overrides: Partial<LiveRoomApiRow> = {}): LiveRoomApiRow {
  return {
    id: 'room_1',
    title: 'Test show',
    description: null,
    category: 'Sports Cards',
    roomType: 'auction',
    status: 'scheduled',
    thumbnailUrl: '',
    viewerCount: 0,
    scheduledStartAt: '2026-06-15T20:00:00.000Z',
    startedAt: null,
    endedAt: null,
    sellerUsername: 'sellerqa',
    itemCount: 0,
    activeItemTitle: null,
    ...overrides,
  };
}

describe('vaultEventModel', () => {
  it('treats scheduled shows with zero inventory as upcoming, not drafts', () => {
    const r = room({ itemCount: 0 });
    expect(vaultEventDisplayStatus(r)).toBe('scheduled');
    expect(vaultEventSection(r)).toBe('upcoming');
  });

  it('buckets start-now scheduled rooms (no scheduledStartAt) as upcoming', () => {
    const r = room({ scheduledStartAt: null, itemCount: 0, status: 'scheduled', title: 'Tonight break' });
    expect(vaultEventDisplayStatus(r)).toBe('scheduled');
    expect(vaultEventSection(r)).toBe('upcoming');
  });

  it('buckets incomplete title as drafts', () => {
    const r = room({ scheduledStartAt: null, title: 'ab', status: 'scheduled' });
    expect(vaultEventDisplayStatus(r)).toBe('draft');
    expect(vaultEventSection(r)).toBe('drafts');
  });

  it('maps live rooms to live_now', () => {
    const r = room({ status: 'live', viewerCount: 12 });
    expect(vaultEventDisplayStatus(r)).toBe('live');
    expect(vaultEventSection(r)).toBe('live_now');
  });

  it('allows cancel for scheduled and live API statuses only', () => {
    expect(canCancelVaultEvent(room({ status: 'scheduled' }))).toBe(true);
    expect(canCancelVaultEvent(room({ status: 'live' }))).toBe(true);
    expect(canCancelVaultEvent(room({ status: 'ended' }))).toBe(false);
  });

  it('routes past shows to Finish team sales (command center), not recap-only', () => {
    expect(primaryCta('processing_recap')).toEqual({
      label: 'Finish team sales',
      action: 'console',
    });
    expect(primaryCta('ended')).toEqual({
      label: 'Finish team sales',
      action: 'console',
    });
  });
});
