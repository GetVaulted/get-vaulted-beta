import { describe, expect, it } from 'vitest';

/**
 * Pure state transitions for Back → mini (hoisted surface).
 * The real provider is React state; this locks the intended lifecycle contract.
 */
function reduceActiveSession(
  state: { mode: 'room' | 'mini' | 'none'; roomId: string | null },
  action:
    | { type: 'attach'; roomId: string }
    | { type: 'minimize' }
    | { type: 'expand' }
    | { type: 'close' }
    | { type: 'detach' },
): { mode: 'room' | 'mini' | 'none'; roomId: string | null } {
  switch (action.type) {
    case 'attach':
      return { mode: 'room', roomId: action.roomId };
    case 'minimize':
      if (!state.roomId) return state;
      return { mode: 'mini', roomId: state.roomId };
    case 'expand':
      if (state.mode !== 'mini') return state;
      return { mode: 'room', roomId: state.roomId };
    case 'close':
      return { mode: 'none', roomId: null };
    case 'detach':
      // Unmount during mini must NOT tear down (Back handoff).
      if (state.mode === 'mini') return state;
      return { mode: 'none', roomId: null };
    default:
      return state;
  }
}

describe('live active session Back→mini contract', () => {
  it('keeps the same room joined across minimize and expand', () => {
    let s: { mode: 'room' | 'mini' | 'none'; roomId: string | null } = {
      mode: 'none',
      roomId: null,
    };
    s = reduceActiveSession(s, { type: 'attach', roomId: 'room_1' });
    expect(s).toEqual({ mode: 'room', roomId: 'room_1' });

    s = reduceActiveSession(s, { type: 'minimize' });
    expect(s).toEqual({ mode: 'mini', roomId: 'room_1' });

    // LiveStagePlayback unmounts on goBack — must not clear mini session.
    s = reduceActiveSession(s, { type: 'detach' });
    expect(s).toEqual({ mode: 'mini', roomId: 'room_1' });

    s = reduceActiveSession(s, { type: 'expand' });
    expect(s).toEqual({ mode: 'room', roomId: 'room_1' });
  });

  it('close tears down after mini', () => {
    let s = reduceActiveSession(
      { mode: 'mini', roomId: 'room_1' },
      { type: 'close' },
    );
    expect(s).toEqual({ mode: 'none', roomId: null });
  });
});
