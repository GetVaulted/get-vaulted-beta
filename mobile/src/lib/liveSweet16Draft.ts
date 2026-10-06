/**
 * Sweet 16 draft client logic (pure): turn detection, order/board derivation, friendly errors.
 * The server stays the gate for every action — this only shapes what the UI shows.
 */
import { isLegacySweet16SlotLabel, liveBreakVariantIsSold, teamAbbrForVariant } from './liveBreakPresets';
import type {
  Sweet16DraftPick,
  Sweet16DraftSnapshot,
  Sweet16DraftStatus,
  Sweet16BoardTile,
  Sweet16OrderRow,
} from '../api/liveSweet16DraftRepository';

export const SWEET16_URGENT_SECONDS = 10;

/** The viewer bought into this draft (the server only resolves a purchase id for paid buyers). */
export function sweet16IsParticipant(draft: Pick<Sweet16DraftSnapshot, 'viewerPurchaseId'> | null | undefined): boolean {
  return Boolean(draft?.viewerPurchaseId);
}

/** True only while a buyer is on the clock AND that buyer is the viewer. */
export function sweet16IsMyTurn(
  draft:
    | Pick<Sweet16DraftSnapshot, 'status' | 'viewerPurchaseId' | 'currentTurnPurchaseId'>
    | null
    | undefined,
): boolean {
  return Boolean(
    draft &&
      draft.status === 'in_progress' &&
      draft.viewerPurchaseId &&
      draft.currentTurnPurchaseId &&
      draft.viewerPurchaseId === draft.currentTurnPurchaseId,
  );
}

/**
 * Stable id of "my current turn" — changes for every turn a buyer owns (a buyer with several
 * purchases gets several keys), null whenever it is not my turn. Drives the auto pop-up and the
 * once-per-turn haptic.
 */
export function sweet16MyTurnKey(
  draft:
    | Pick<Sweet16DraftSnapshot, 'itemId' | 'status' | 'viewerPurchaseId' | 'currentTurnPurchaseId' | 'currentTurnIndex'>
    | null
    | undefined,
): string | null {
  if (!draft || !sweet16IsMyTurn(draft)) return null;
  return `${draft.itemId}:${draft.currentTurnIndex ?? 'x'}:${draft.currentTurnPurchaseId}`;
}

/**
 * Auto-open decision: open when it just became my turn, but never re-open a turn the viewer has
 * already dismissed.
 */
export function shouldAutoOpenForTurn(args: {
  myTurnKey: string | null;
  dismissedTurnKey: string | null;
  lastAutoOpenedKey: string | null;
}): boolean {
  if (!args.myTurnKey) return false;
  if (args.myTurnKey === args.dismissedTurnKey) return false;
  return args.myTurnKey !== args.lastAutoOpenedKey;
}

export function sweet16SecondsLeft(deadlineAt: string | null | undefined, nowMs: number): number | null {
  if (!deadlineAt) return null;
  const end = Date.parse(deadlineAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

export function sweet16Countdown(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function sweet16IsLive(status: Sweet16DraftStatus | null | undefined): boolean {
  return status === 'order_set' || status === 'in_progress';
}

export function formatUsernameHandle(username: string | null | undefined): string {
  const u = username?.trim().replace(/^@+/, '');
  return u ? `@${u}` : 'A buyer';
}

export type Sweet16OrderDisplayRow = Sweet16OrderRow & {
  /** 1-based turn number for display. */
  turnNumber: number;
  isCurrent: boolean;
  isDone: boolean;
  isMe: boolean;
};

/** Order list with per-row state for the current status. */
export function sweet16OrderRows(draft: Sweet16DraftSnapshot): Sweet16OrderDisplayRow[] {
  const doneIds = new Set(draft.picks.map((p) => p.purchaseId));
  return [...draft.order]
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .map((row) => ({
      ...row,
      turnNumber: row.turnIndex + 1,
      isCurrent: draft.status === 'in_progress' && row.purchaseId === draft.currentTurnPurchaseId,
      isDone: doneIds.has(row.purchaseId),
      isMe: Boolean(draft.viewerPurchaseId) && row.purchaseId === draft.viewerPurchaseId,
    }));
}

export type Sweet16ResultRow = {
  purchaseId: string;
  turnIndex: number;
  buyerUsername: string | null;
  boughtTeamLabel: string | null;
  boughtTeamAbbr: string | null;
  draftedTeamLabel: string | null;
  draftedTeamAbbr: string | null;
  autoAssigned: boolean;
};

/** Final result: every buyer with the team they bought and the team they drafted. */
export function sweet16ResultRows(draft: Sweet16DraftSnapshot): Sweet16ResultRow[] {
  const pickByPurchase = new Map(draft.picks.map((p) => [p.purchaseId, p]));
  return [...draft.order]
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .map((row) => {
      const pick = pickByPurchase.get(row.purchaseId);
      return {
        purchaseId: row.purchaseId,
        turnIndex: row.turnIndex,
        buyerUsername: row.buyerUsername ?? pick?.buyerUsername ?? null,
        boughtTeamLabel: row.boughtTeamLabel,
        boughtTeamAbbr: row.boughtTeamAbbr,
        draftedTeamLabel: pick?.teamLabel ?? null,
        draftedTeamAbbr: pick?.teamAbbr ?? null,
        autoAssigned: pick?.autoAssigned ?? false,
      };
    });
}

export type Sweet16BoardCounts = { open: number; purchased: number; drafted: number; total: number };

export function sweet16BoardCounts(board: readonly Sweet16BoardTile[]): Sweet16BoardCounts {
  let open = 0;
  let purchased = 0;
  let drafted = 0;
  for (const t of board) {
    if (t.state === 'open') open += 1;
    else if (t.state === 'purchased') purchased += 1;
    else drafted += 1;
  }
  return { open, purchased, drafted, total: board.length };
}

/** The draft pool: tiles nobody bought (and nobody has drafted yet). */
export function sweet16OpenLabels(board: readonly Sweet16BoardTile[]): string[] {
  return board.filter((t) => t.state === 'open').map((t) => t.label);
}

/** Tiles the on-the-clock buyer may pick: the board's open tiles, falling back to the server list. */
export function sweet16SelectableLabels(draft: Pick<Sweet16DraftSnapshot, 'board' | 'remainingTeamLabels'>): Set<string> {
  const board = draft.board ?? [];
  return new Set(board.length > 0 ? sweet16OpenLabels(board) : draft.remainingTeamLabels);
}

/** Never trust a stale selection: drop it when the team is no longer in the open pool. */
export function reconcileSweet16Selection(selected: string | null, selectable: ReadonlySet<string>): string | null {
  return selected && selectable.has(selected) ? selected : null;
}

const SWEET16_ERROR_COPY: Record<string, string> = {
  NOT_READY: 'Sales are not closed yet — wait until 16 teams are sold.',
  PAYMENTS_PENDING: 'A checkout is still in progress. Try again in a moment.',
  ORDER_ALREADY_SET: 'The draft order is already set.',
  NO_PAID_SLOTS: 'No teams have been paid for yet.',
  POOL_TOO_SMALL: 'Not enough teams are left on the board for this draft.',
  ORDER_NOT_SET: 'Randomize the draft order first.',
  ALREADY_STARTED: 'This draft has already started.',
  NOT_YOUR_TURN: "It's not your turn yet.",
  SOLD_OUT: 'All 16 teams are sold — sales are closed.',
  DRAFT_NOT_FOUND: 'The host has not set the draft order yet.',
  DRAFT_NOT_ACTIVE: 'The draft is not running right now.',
  TURN_EXPIRED: 'Your turn timed out — a team was assigned for you.',
  NOT_A_PARTICIPANT: "You don't own a team in this break.",
  INVALID_TEAM: 'That team is not available. Pick another.',
  NOT_A_SWEET16_ITEM: 'This lot is not a Sweet 16 break.',
};

/** Friendly copy for a server error code, falling back to the server message. */
export function sweet16ErrorMessage(code: string | null | undefined, fallback: string | null | undefined): string {
  if (code && SWEET16_ERROR_COPY[code]) return SWEET16_ERROR_COPY[code]!;
  const f = fallback?.trim();
  return f || 'Something went wrong. Please try again.';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const STATUSES: readonly Sweet16DraftStatus[] = ['not_started', 'order_set', 'in_progress', 'complete'];

/**
 * Defensive parse of the server DTO. Tolerates an older server (no `order` / `board` /
 * `maxSpots`) by deriving what it can, so the sheet never crashes on a missing field.
 */
export function normalizeSweet16Draft(raw: unknown): Sweet16DraftSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemId = str(o.itemId);
  if (!itemId) return null;
  let status = STATUSES.includes(o.status as Sweet16DraftStatus) ? (o.status as Sweet16DraftStatus) : 'not_started';
  const turnOrder = strArray(o.turnOrder);
  if (status === 'not_started' && turnOrder.length > 0) status = 'order_set';

  const picks: Sweet16DraftPick[] = (Array.isArray(o.picks) ? o.picks : []).flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const r = p as Record<string, unknown>;
    const purchaseId = str(r.purchaseId);
    const teamLabel = str(r.teamLabel);
    if (!purchaseId || !teamLabel) return [];
    return [
      {
        purchaseId,
        turnIndex: num(r.turnIndex) ?? 0,
        teamLabel,
        teamAbbr: str(r.teamAbbr) ?? teamLabel.slice(0, 3).toUpperCase(),
        autoAssigned: r.autoAssigned === true,
        buyerUsername: str(r.buyerUsername),
      },
    ];
  });

  const order: Sweet16OrderRow[] = Array.isArray(o.order)
    ? (o.order as unknown[]).flatMap((row, i) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        const purchaseId = str(r.purchaseId);
        if (!purchaseId) return [];
        return [
          {
            purchaseId,
            turnIndex: num(r.turnIndex) ?? i,
            buyerUsername: str(r.buyerUsername),
            boughtTeamLabel: str(r.boughtTeamLabel),
            boughtTeamAbbr: str(r.boughtTeamAbbr),
          },
        ];
      })
    : turnOrder.map((purchaseId, turnIndex) => ({
        purchaseId,
        turnIndex,
        buyerUsername: picks.find((p) => p.purchaseId === purchaseId)?.buyerUsername ?? null,
        boughtTeamLabel: null,
        boughtTeamAbbr: null,
      }));

  const board: Sweet16BoardTile[] = (Array.isArray(o.board) ? (o.board as unknown[]) : []).flatMap((t) => {
    if (!t || typeof t !== 'object') return [];
    const r = t as Record<string, unknown>;
    const label = str(r.label);
    if (!label) return [];
    const state = r.state === 'purchased' || r.state === 'drafted' ? r.state : 'open';
    return [
      {
        label,
        abbr: str(r.abbr) ?? label.slice(0, 3).toUpperCase(),
        state,
        buyerUsername: str(r.buyerUsername),
        purchaseId: str(r.purchaseId),
      },
    ];
  });

  return {
    itemId,
    liveRoomId: str(o.liveRoomId) ?? '',
    status,
    turnOrder,
    order,
    board,
    maxSpots: num(o.maxSpots) ?? 16,
    soldCount: num(o.soldCount) ?? order.length,
    currentTurnIndex: num(o.currentTurnIndex),
    currentTurnPurchaseId: str(o.currentTurnPurchaseId),
    currentTurnBuyerUsername: str(o.currentTurnBuyerUsername),
    currentTurnDeadlineAt: str(o.currentTurnDeadlineAt),
    remainingTeamLabels: strArray(o.remainingTeamLabels),
    turnSeconds: num(o.turnSeconds) ?? 60,
    startedAt: str(o.startedAt),
    completedAt: str(o.completedAt),
    viewerPurchaseId: str(o.viewerPurchaseId),
    picks,
  };
}

type BoardVariantLike = {
  label: string;
  color?: string | null;
  quantityRemaining?: number | null;
  status?: string | null;
  buyerUsername?: string | null;
};

/**
 * Pre-draft board (before the host randomizes, the draft snapshot does not exist yet): derive the
 * 32 tiles from the item's own variants. Legacy "Slot N" items have no team tiles, so they yield
 * an empty board (the server provides the NFL pool once the draft exists).
 */
export function sweet16BoardFromVariants(variants: readonly BoardVariantLike[] | null | undefined): Sweet16BoardTile[] {
  const rows = (variants ?? []).filter((v) => v.status !== 'removed');
  if (rows.length === 0 || rows.some((v) => isLegacySweet16SlotLabel(v.label))) return [];
  return rows.map((v) => ({
    label: v.label,
    abbr: teamAbbrForVariant(v.label, v.color) ?? v.label.slice(0, 3).toUpperCase(),
    state: liveBreakVariantIsSold(v) ? ('purchased' as const) : ('open' as const),
    buyerUsername: v.buyerUsername?.trim() || null,
    purchaseId: null,
  }));
}
