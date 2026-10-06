import { describe, expect, it } from 'vitest';
import type { Sweet16DraftSnapshot } from '../api/liveSweet16DraftRepository';
import {
  formatUsernameHandle,
  normalizeSweet16Draft,
  reconcileSweet16Selection,
  shouldAutoOpenForTurn,
  sweet16BoardCounts,
  sweet16BoardFromVariants,
  sweet16Countdown,
  sweet16ErrorMessage,
  sweet16IsMyTurn,
  sweet16IsParticipant,
  sweet16MyTurnKey,
  sweet16OrderRows,
  sweet16ResultRows,
  sweet16SecondsLeft,
  sweet16SelectableLabels,
} from './liveSweet16Draft';

function makeDraft(overrides: Partial<Sweet16DraftSnapshot> = {}): Sweet16DraftSnapshot {
  return {
    itemId: 'item-1',
    liveRoomId: 'room-1',
    status: 'in_progress',
    turnOrder: ['p2', 'p1'],
    order: [
      { purchaseId: 'p2', turnIndex: 0, buyerUsername: 'bob', boughtTeamLabel: 'Dallas Cowboys', boughtTeamAbbr: 'DAL' },
      { purchaseId: 'p1', turnIndex: 1, buyerUsername: 'amy', boughtTeamLabel: 'Kansas City Chiefs', boughtTeamAbbr: 'KC' },
    ],
    board: [
      { label: 'Dallas Cowboys', abbr: 'DAL', state: 'purchased', buyerUsername: 'bob', purchaseId: 'p2' },
      { label: 'Kansas City Chiefs', abbr: 'KC', state: 'purchased', buyerUsername: 'amy', purchaseId: 'p1' },
      { label: 'Buffalo Bills', abbr: 'BUF', state: 'open', buyerUsername: null, purchaseId: null },
      { label: 'Denver Broncos', abbr: 'DEN', state: 'open', buyerUsername: null, purchaseId: null },
    ],
    maxSpots: 16,
    soldCount: 2,
    currentTurnIndex: 0,
    currentTurnPurchaseId: 'p2',
    currentTurnBuyerUsername: 'bob',
    currentTurnDeadlineAt: '2026-10-06T12:01:00.000Z',
    remainingTeamLabels: ['Buffalo Bills', 'Denver Broncos'],
    turnSeconds: 60,
    startedAt: '2026-10-06T12:00:00.000Z',
    completedAt: null,
    viewerPurchaseId: 'p2',
    picks: [],
    ...overrides,
  };
}

describe('turn detection', () => {
  it('is my turn only when in progress and the viewer is on the clock', () => {
    expect(sweet16IsMyTurn(makeDraft())).toBe(true);
    expect(sweet16IsMyTurn(makeDraft({ viewerPurchaseId: 'p1' }))).toBe(false);
    expect(sweet16IsMyTurn(makeDraft({ status: 'order_set', currentTurnPurchaseId: null }))).toBe(false);
    expect(sweet16IsMyTurn(makeDraft({ viewerPurchaseId: null }))).toBe(false);
    expect(sweet16IsMyTurn(null)).toBe(false);
  });

  it('derives a distinct key per turn and null otherwise', () => {
    const t0 = sweet16MyTurnKey(makeDraft());
    const t1 = sweet16MyTurnKey(
      makeDraft({ viewerPurchaseId: 'p1', currentTurnPurchaseId: 'p1', currentTurnIndex: 1 }),
    );
    expect(t0).toBe('item-1:0:p2');
    expect(t1).toBe('item-1:1:p1');
    expect(t0).not.toBe(t1);
    expect(sweet16MyTurnKey(makeDraft({ viewerPurchaseId: 'p1' }))).toBeNull();
    expect(sweet16MyTurnKey(null)).toBeNull();
  });

  it('treats a viewer with a purchase as a participant', () => {
    expect(sweet16IsParticipant(makeDraft())).toBe(true);
    expect(sweet16IsParticipant(makeDraft({ viewerPurchaseId: null }))).toBe(false);
  });
});

describe('shouldAutoOpenForTurn', () => {
  it('opens on a fresh turn, not twice, and never after a dismissal of the same turn', () => {
    const key = 'item-1:0:p2';
    expect(shouldAutoOpenForTurn({ myTurnKey: key, dismissedTurnKey: null, lastAutoOpenedKey: null })).toBe(true);
    expect(shouldAutoOpenForTurn({ myTurnKey: key, dismissedTurnKey: null, lastAutoOpenedKey: key })).toBe(false);
    expect(shouldAutoOpenForTurn({ myTurnKey: key, dismissedTurnKey: key, lastAutoOpenedKey: null })).toBe(false);
    expect(shouldAutoOpenForTurn({ myTurnKey: null, dismissedTurnKey: null, lastAutoOpenedKey: null })).toBe(false);
  });

  it('re-opens for a later turn the same buyer owns', () => {
    expect(
      shouldAutoOpenForTurn({
        myTurnKey: 'item-1:5:p9',
        dismissedTurnKey: 'item-1:0:p2',
        lastAutoOpenedKey: 'item-1:0:p2',
      }),
    ).toBe(true);
  });
});

describe('order / result / board derivation', () => {
  it('marks the current row and the viewer in the order list', () => {
    const rows = sweet16OrderRows(makeDraft());
    expect(rows.map((r) => r.turnNumber)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ isCurrent: true, isMe: true, isDone: false });
    expect(rows[1]).toMatchObject({ isCurrent: false, isMe: false });
  });

  it('does not highlight anyone while the order is set but the draft has not started', () => {
    const rows = sweet16OrderRows(makeDraft({ status: 'order_set', currentTurnPurchaseId: null }));
    expect(rows.some((r) => r.isCurrent)).toBe(false);
  });

  it('pairs each buyer with the team they bought and the team they drafted', () => {
    const draft = makeDraft({
      status: 'complete',
      picks: [
        { purchaseId: 'p2', turnIndex: 0, teamLabel: 'Buffalo Bills', teamAbbr: 'BUF', autoAssigned: false, buyerUsername: 'bob' },
        { purchaseId: 'p1', turnIndex: 1, teamLabel: 'Denver Broncos', teamAbbr: 'DEN', autoAssigned: true, buyerUsername: 'amy' },
      ],
    });
    const rows = sweet16ResultRows(draft);
    expect(rows[0]).toMatchObject({ buyerUsername: 'bob', boughtTeamLabel: 'Dallas Cowboys', draftedTeamLabel: 'Buffalo Bills' });
    expect(rows[1]).toMatchObject({ buyerUsername: 'amy', draftedTeamLabel: 'Denver Broncos', autoAssigned: true });
  });

  it('counts board states and exposes only open tiles as selectable', () => {
    const draft = makeDraft();
    expect(sweet16BoardCounts(draft.board)).toEqual({ open: 2, purchased: 2, drafted: 0, total: 4 });
    expect([...sweet16SelectableLabels(draft)].sort()).toEqual(['Buffalo Bills', 'Denver Broncos']);
  });

  it('falls back to the server remaining list when the board is missing', () => {
    expect([...sweet16SelectableLabels({ board: [], remainingTeamLabels: ['Buffalo Bills'] })]).toEqual(['Buffalo Bills']);
  });

  it('drops a stale selection', () => {
    const selectable = new Set(['Buffalo Bills']);
    expect(reconcileSweet16Selection('Buffalo Bills', selectable)).toBe('Buffalo Bills');
    expect(reconcileSweet16Selection('Denver Broncos', selectable)).toBeNull();
    expect(reconcileSweet16Selection(null, selectable)).toBeNull();
  });

  it('builds the pre-draft board from item variants', () => {
    const tiles = sweet16BoardFromVariants([
      { label: 'Kansas City Chiefs', color: 'KC', quantityRemaining: 0, status: 'sold_out', buyerUsername: 'amy' },
      { label: 'Buffalo Bills', color: 'BUF', quantityRemaining: 1, status: 'available' },
    ]);
    expect(tiles).toEqual([
      { label: 'Kansas City Chiefs', abbr: 'KC', state: 'purchased', buyerUsername: 'amy', purchaseId: null },
      { label: 'Buffalo Bills', abbr: 'BUF', state: 'open', buyerUsername: null, purchaseId: null },
    ]);
  });

  it('yields no pre-draft board for legacy Slot N items', () => {
    expect(sweet16BoardFromVariants([{ label: 'Slot 1', quantityRemaining: 1, status: 'available' }])).toEqual([]);
  });
});

describe('countdown + copy helpers', () => {
  it('computes seconds left and formats m:ss', () => {
    const now = Date.parse('2026-10-06T12:00:30.000Z');
    expect(sweet16SecondsLeft('2026-10-06T12:01:00.000Z', now)).toBe(30);
    expect(sweet16SecondsLeft('2026-10-06T11:00:00.000Z', now)).toBe(0);
    expect(sweet16SecondsLeft(null, now)).toBeNull();
    expect(sweet16Countdown(65)).toBe('1:05');
    expect(sweet16Countdown(9)).toBe('0:09');
    expect(sweet16Countdown(null)).toBe('--:--');
  });

  it('formats handles', () => {
    expect(formatUsernameHandle('@bob')).toBe('@bob');
    expect(formatUsernameHandle('bob')).toBe('@bob');
    expect(formatUsernameHandle(null)).toBe('A buyer');
  });

  it('maps server error codes to friendly text and falls back to the server message', () => {
    expect(sweet16ErrorMessage('NOT_READY', 'x')).toMatch(/not closed yet/i);
    expect(sweet16ErrorMessage('ORDER_NOT_SET', 'x')).toBe('Randomize the draft order first.');
    expect(sweet16ErrorMessage('NOT_YOUR_TURN', null)).toMatch(/not your turn/i);
    expect(sweet16ErrorMessage('SOMETHING_NEW', 'Server says no')).toBe('Server says no');
    expect(sweet16ErrorMessage(undefined, '')).toMatch(/try again/i);
  });
});

describe('normalizeSweet16Draft', () => {
  it('returns null for junk', () => {
    expect(normalizeSweet16Draft(null)).toBeNull();
    expect(normalizeSweet16Draft({})).toBeNull();
  });

  it('passes a full DTO through', () => {
    const draft = makeDraft();
    expect(normalizeSweet16Draft(draft)).toEqual(draft);
  });

  it('tolerates an older server without order/board and infers order_set from the turn order', () => {
    const d = normalizeSweet16Draft({
      itemId: 'item-1',
      liveRoomId: 'room-1',
      status: 'not_started',
      turnOrder: ['p1', 'p2'],
      picks: [],
    });
    expect(d?.status).toBe('order_set');
    expect(d?.order.map((r) => r.purchaseId)).toEqual(['p1', 'p2']);
    expect(d?.board).toEqual([]);
    expect(d?.maxSpots).toBe(16);
  });
});
