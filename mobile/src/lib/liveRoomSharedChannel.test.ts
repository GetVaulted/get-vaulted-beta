import { describe, expect, it } from 'vitest';
import { buildPresenceChannelKey, resolvePresenceSlotSync } from './liveRoomPresenceKey';
import {
  peekLiveRoomChannel,
  releaseLiveRoomChannel,
  resetLiveRoomSharedChannelsForTests,
  retainLiveRoomChannel,
  subscribeLiveRoomChannel,
} from './liveRoomSharedChannel';
import { roomChannel } from './realtimeChannels';

function mockChannel(name: string, opts: unknown, subscribeImpl?: (cb: (status: string) => void) => unknown) {
  const channel: {
    name: string;
    opts: unknown;
    on: (..._args: unknown[]) => typeof channel;
    subscribe: (cb: (status: string) => void) => unknown;
    presenceState: () => Record<string, never>;
  } = {
    name,
    opts,
    on: (..._args: unknown[]) => channel,
    subscribe: subscribeImpl ?? (() => ({})),
    presenceState: () => ({}),
  };
  return channel;
}

describe('liveRoomSharedChannel', () => {
  it('shares one channel per room and ref-counts retain/release', () => {
    resetLiveRoomSharedChannelsForTests();
    const supabase = {
      channel: (name: string, opts: unknown) => mockChannel(name, opts),
      removeChannel: () => {},
    } as never;

    const a = retainLiveRoomChannel(supabase, 'room-1', 'viewer-a');
    const b = retainLiveRoomChannel(supabase, 'room-1', 'viewer-b');
    expect(a).toBe(b);
    expect(peekLiveRoomChannel('room-1')).toBe(a);

    releaseLiveRoomChannel(supabase, 'room-1');
    expect(peekLiveRoomChannel('room-1')).toBe(a);

    releaseLiveRoomChannel(supabase, 'room-1');
    expect(peekLiveRoomChannel('room-1')).toBeNull();
  });

  it('subscribes once and replays last status to late listeners', async () => {
    resetLiveRoomSharedChannelsForTests();
    const statuses: string[] = [];
    const supabase = {
      channel: (_name: string, _opts: unknown) =>
        mockChannel(_name, _opts, (cb) => {
          cb('SUBSCRIBED');
          return {};
        }),
      removeChannel: () => {},
    } as never;

    retainLiveRoomChannel(supabase, 'room-2', 'viewer-a');
    subscribeLiveRoomChannel('room-2', (status) => {
      statuses.push(`first:${status}`);
    });
    // Subscribe is deferred so presence handlers can attach first.
    await Promise.resolve();
    subscribeLiveRoomChannel('room-2', (status) => {
      statuses.push(`second:${status}`);
    });

    expect(statuses).toEqual(['first:SUBSCRIBED', 'second:SUBSCRIBED']);
  });

  it('uses room topic names aligned with web', () => {
    expect(roomChannel('abc')).toBe('gv-room-abc');
  });
});

describe('liveRoomPresenceKey', () => {
  it('builds stable viewer keys per user', () => {
    const key1 = buildPresenceChannelKey('room-1', 'user-1', true);
    const key2 = buildPresenceChannelKey('room-1', 'user-1', true);
    expect(key1).toBe(key2);
    expect(key1.startsWith('room-1:')).toBe(true);
  });

  it('uses observer keys for host-only listeners', () => {
    const key = buildPresenceChannelKey('room-1', 'host-1', false);
    expect(key.startsWith('observer:room-1:')).toBe(true);
  });

  it('reuses in-memory presence slots', () => {
    const slotA = resolvePresenceSlotSync('user-a');
    const slotB = resolvePresenceSlotSync('user-a');
    expect(slotA).toBe(slotB);
  });
});
