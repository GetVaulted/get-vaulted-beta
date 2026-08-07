import { describe, expect, it } from 'vitest';

/**
 * Pure state transitions for Back → mini (hoisted surface).
 * The real provider is React state; this locks the intended lifecycle contract.
 */
function reduceActiveSession(
  state: { mode: 'room' | 'mini' | 'none'; roomId: string | null; attachGen: number },
  action:
    | { type: 'attach'; roomId: string }
    | { type: 'minimize' }
    | { type: 'expand' }
    | { type: 'close' }
    | { type: 'detach' },
): { mode: 'room' | 'mini' | 'none'; roomId: string | null; attachGen: number } {
  switch (action.type) {
    case 'attach': {
      const gen = state.attachGen + 1;
      // Same-room re-attach patches in place — must not pass through none.
      if (state.roomId === action.roomId && (state.mode === 'room' || state.mode === 'mini')) {
        return { mode: 'room', roomId: action.roomId, attachGen: gen };
      }
      return { mode: 'room', roomId: action.roomId, attachGen: gen };
    }
    case 'minimize':
      if (!state.roomId) return state;
      return { ...state, mode: 'mini' };
    case 'expand':
      if (state.mode !== 'mini') return state;
      return { ...state, mode: 'room' };
    case 'close':
      return { mode: 'none', roomId: null, attachGen: state.attachGen };
    case 'detach':
      // Unmount during mini must NOT tear down (Back handoff).
      if (state.mode === 'mini') return state;
      return { mode: 'none', roomId: null, attachGen: state.attachGen };
    default:
      return state;
  }
}

describe('live active session Back→mini contract', () => {
  it('keeps the same room joined across minimize and expand', () => {
    let s: { mode: 'room' | 'mini' | 'none'; roomId: string | null; attachGen: number } = {
      mode: 'none',
      roomId: null,
      attachGen: 0,
    };
    s = reduceActiveSession(s, { type: 'attach', roomId: 'room_1' });
    expect(s).toMatchObject({ mode: 'room', roomId: 'room_1' });

    s = reduceActiveSession(s, { type: 'minimize' });
    expect(s).toMatchObject({ mode: 'mini', roomId: 'room_1' });

    // LiveStagePlayback unmounts on goBack — must not clear mini session.
    s = reduceActiveSession(s, { type: 'detach' });
    expect(s).toMatchObject({ mode: 'mini', roomId: 'room_1' });

    s = reduceActiveSession(s, { type: 'expand' });
    expect(s).toMatchObject({ mode: 'room', roomId: 'room_1' });
  });

  it('same-room re-attach does not clear the session', () => {
    let s = reduceActiveSession(
      { mode: 'none', roomId: null, attachGen: 0 },
      { type: 'attach', roomId: 'room_1' },
    );
    const genAfterFirst = s.attachGen;
    s = reduceActiveSession(s, { type: 'attach', roomId: 'room_1' });
    expect(s).toMatchObject({ mode: 'room', roomId: 'room_1' });
    expect(s.attachGen).toBeGreaterThan(genAfterFirst);
  });

  it('close tears down after mini', () => {
    let s = reduceActiveSession(
      { mode: 'mini', roomId: 'room_1', attachGen: 1 },
      { type: 'close' },
    );
    expect(s).toMatchObject({ mode: 'none', roomId: null });
  });
});
