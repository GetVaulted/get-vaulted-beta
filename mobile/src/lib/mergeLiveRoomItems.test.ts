import { describe, expect, it } from 'vitest';
import { mergeLiveRoomItemsById, reconcileHostActiveItem } from './mergeLiveRoomItems';

describe('reconcileHostActiveItem', () => {
  it('replaces active item when host pins a different lot', () => {
    const prev = { id: 'pyd-main', sortOrder: 0, itemVersion: 3, title: 'PYD Break' };
    const next = { id: 'pyd-suppy', sortOrder: 1, itemVersion: 1, title: 'PYD Suppy' };
    expect(reconcileHostActiveItem(prev, next)).toEqual(next);
  });

  it('merges same lot updates monotonically by itemVersion', () => {
    const prev = { id: 'lot-a', sortOrder: 0, itemVersion: 2, title: 'Before' };
    const next = { id: 'lot-a', sortOrder: 0, itemVersion: 5, title: 'After' };
    expect(reconcileHostActiveItem(prev, next)).toEqual(next);
  });

  it('returns null when server has no active lot', () => {
    expect(reconcileHostActiveItem({ id: 'a', sortOrder: 0 }, null)).toBeNull();
  });
});

describe('mergeLiveRoomItemsById', () => {
  it('does not drop unrelated queue rows when merging active switch payloads', () => {
    const prev = [
      { id: 'pyd-main', sortOrder: 0, itemVersion: 3 },
      { id: 'pyd-suppy', sortOrder: 1, itemVersion: 1 },
    ];
    const incoming = [
      { id: 'pyd-main', sortOrder: 0, itemVersion: 4, status: 'queued' },
      { id: 'pyd-suppy', sortOrder: 1, itemVersion: 2, status: 'active' },
    ];
    const merged = mergeLiveRoomItemsById(prev, incoming as typeof prev);
    expect(merged.find((i) => i.id === 'pyd-suppy')?.itemVersion).toBe(2);
    expect(merged.find((i) => i.id === 'pyd-main')?.itemVersion).toBe(4);
  });
});
