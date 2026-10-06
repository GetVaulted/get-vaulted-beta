/**
 * Browser-side helpers for the Sweet 16 live draft: typed fetch wrappers for the three draft
 * endpoints plus the small pure rules the UI derives from a draft snapshot (turn ownership,
 * countdown text, progress). The server stays authoritative -- every rule here only decides what
 * to show, never what is allowed.
 */
import type { Sweet16DraftDto } from "@/lib/live-sweet16-draft";
import { SWEET16_MAX_SPOTS, type Sweet16BoardTile } from "@/lib/live-sweet16-draft-logic";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

export type Sweet16Draft = Sweet16DraftDto;

/** How often an open draft view re-polls. Matches the phone app so the server's 60 s turn clock
 *  and cron sweep see the same cadence from every client. */
export const SWEET16_POLL_MS = 3000;

/** Final seconds of a turn render in the urgent style. */
export const SWEET16_URGENT_MS = 10_000;

export class Sweet16RequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "Sweet16RequestError";
    this.status = status;
    this.code = code;
  }
}

/** "0:42" -- rounds up so the clock never shows 0:00 while the turn is still open. */
export function formatDraftCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Milliseconds left on the current turn, or null when no turn is running. */
export function turnRemainingMs(draft: Sweet16Draft | null, nowMs: number): number | null {
  if (!draft || draft.status !== "in_progress" || !draft.currentTurnDeadlineAt) return null;
  const deadline = new Date(draft.currentTurnDeadlineAt).getTime();
  return Number.isNaN(deadline) ? null : deadline - nowMs;
}

/** True when the viewer owns the purchase whose turn it is. */
export function isViewerTurn(draft: Sweet16Draft | null): boolean {
  return Boolean(
    draft &&
      draft.status === "in_progress" &&
      draft.viewerPurchaseId &&
      draft.currentTurnPurchaseId &&
      draft.viewerPurchaseId === draft.currentTurnPurchaseId,
  );
}

/** Stable key for "this particular turn is mine" (one per slot, so a multi-slot buyer re-triggers). */
export function viewerTurnKey(draft: Sweet16Draft | null): string | null {
  return isViewerTurn(draft) ? (draft?.currentTurnPurchaseId ?? null) : null;
}

export function draftProgress(draft: Sweet16Draft | null): { current: number; total: number } {
  const total = draft?.turnOrder.length || 16;
  const made = draft?.picks.length ?? 0;
  const current = draft?.status === "in_progress" ? Math.min(made + 1, total) : Math.min(made, total);
  return { current, total };
}

export type DraftPill = { text: string; tone: "idle" | "turn" | "urgent" | "done" };

/** Text for the floating launcher button. */
export function draftPillState(
  draft: Sweet16Draft | null,
  nowMs: number,
  opts: { isHost: boolean },
): DraftPill {
  if (!draft || draft.status === "not_started") {
    return {
      text: opts.isHost ? "Randomize draft order" : "Sweet 16 draft · waiting for host",
      tone: "idle",
    };
  }
  if (draft.status === "order_set") {
    return { text: opts.isHost ? "Start Sweet 16 draft" : "Sweet 16 draft · order set", tone: "idle" };
  }
  if (draft.status === "complete") return { text: "Sweet 16 draft · complete", tone: "done" };
  const remaining = turnRemainingMs(draft, nowMs);
  const clock = remaining != null ? ` · ${formatDraftCountdown(remaining)}` : "";
  if (isViewerTurn(draft)) {
    return {
      text: `Your pick${clock}`,
      tone: remaining != null && remaining <= SWEET16_URGENT_MS ? "urgent" : "turn",
    };
  }
  const { current, total } = draftProgress(draft);
  return { text: `Sweet 16 draft · pick ${current} of ${total}${clock}`, tone: "idle" };
}

/** Everything the Sweet 16 UI needs to know about an item, without pulling the whole DTO in. */
type Sweet16ItemLike = Pick<LiveRoomItemDTO, "variantAssignmentMode" | "variants" | "variantBreakReadyAt">;

/** Sweet 16 lots are the only ones that use the `draft` assignment mode. */
export function isSweet16DraftItem(
  item: Pick<LiveRoomItemDTO, "variantAssignmentMode"> | null | undefined,
): boolean {
  return item?.variantAssignmentMode === "draft";
}

export type Sweet16SalesStatus = {
  sold: number;
  max: number;
  /** Sales are shut: the 16th team is paid (server flag) or 16 are already sold/reserved. */
  closed: boolean;
  /** "7 of 16 sold" or "Sales closed — 16 teams sold". */
  label: string;
};

/**
 * "N of 16 sold" for the board and checkout. The board lists 32 teams but only 16 can be sold, so
 * the generic "spots open" count (of 32) would be misleading. `null` for every non-Sweet-16 lot.
 */
export function sweet16SalesStatus(item: Sweet16ItemLike | null | undefined): Sweet16SalesStatus | null {
  if (!item || !isSweet16DraftItem(item)) return null;
  const max = SWEET16_MAX_SPOTS;
  const live = (item.variants ?? []).filter((v) => v.status !== "removed");
  const bySoldCount = live.reduce((sum, v) => sum + Math.max(0, v.soldCount ?? 0), 0);
  const bySoldOut = live.filter((v) => v.quantityRemaining <= 0 || v.status === "sold_out").length;
  const sold = Math.min(max, Math.max(bySoldCount, bySoldOut));
  const closed = Boolean(item.variantBreakReadyAt) || sold >= max;
  return {
    sold: closed ? Math.max(sold, max) : sold,
    max,
    closed,
    label: closed ? `Sales closed — ${max} teams sold` : `${sold} of ${max} sold`,
  };
}

/** Board built from the lot's own variants -- used before the draft row exists (no randomize yet). */
export function sweet16BoardFromItem(item: Pick<LiveRoomItemDTO, "variants">): Sweet16BoardTile[] {
  return [...(item.variants ?? [])]
    .filter((v) => v.status !== "removed")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((v) => {
      const sold = v.quantityRemaining <= 0 || v.status === "sold_out";
      return {
        label: v.label,
        abbr: v.label,
        state: sold ? ("purchased" as const) : ("open" as const),
        buyerUsername: sold ? (v.buyerUsername?.trim().replace(/^@+/, "") ?? null) : null,
        purchaseId: null,
      };
    });
}

/** The server's board once it exists (it knows drafted teams), otherwise the lot's own variants. */
export function sweet16Board(
  draft: Sweet16Draft | null,
  item: Pick<LiveRoomItemDTO, "variants"> | null | undefined,
): Sweet16BoardTile[] {
  if (draft?.board?.length) return draft.board;
  return item ? sweet16BoardFromItem(item) : [];
}

export function sweet16BoardCounts(board: readonly Sweet16BoardTile[]): {
  open: number;
  purchased: number;
  drafted: number;
} {
  const counts = { open: 0, purchased: 0, drafted: 0 };
  for (const t of board) counts[t.state] += 1;
  return counts;
}

/** Short caption under a tile: who owns it and how, or "Open". */
export function sweet16TileCaption(tile: Sweet16BoardTile): string {
  const who = tile.buyerUsername ? `@${tile.buyerUsername}` : null;
  if (tile.state === "open") return "Open";
  if (tile.state === "drafted") return who ? `Drafted by ${who}` : "Drafted";
  return who ? `Bought by ${who}` : "Bought";
}

/** Whether the viewer may tap this tile on their turn. The server re-checks every pick. */
export function isSweet16TileSelectable(draft: Sweet16Draft | null, tile: Sweet16BoardTile): boolean {
  if (!draft || tile.state !== "open") return false;
  if (draft.remainingTeamLabels.length === 0) return true;
  return draft.remainingTeamLabels.includes(tile.label);
}

export type Sweet16OrderRow = {
  purchaseId: string;
  turnIndex: number;
  /** 1-based position shown to people. */
  position: number;
  buyerUsername: string | null;
  boughtTeamLabel: string | null;
  draftedTeamLabel: string | null;
  state: "done" | "current" | "upcoming";
  mine: boolean;
};

/** The numbered draft order with where each buyer is in it. Empty before the order is set. */
export function sweet16OrderRows(draft: Sweet16Draft | null): Sweet16OrderRow[] {
  if (!draft) return [];
  const pickByPurchase = new Map(draft.picks.map((p) => [p.purchaseId, p.teamLabel]));
  return [...draft.order]
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .map((o) => {
      const drafted = pickByPurchase.get(o.purchaseId) ?? null;
      const current = draft.status === "in_progress" && draft.currentTurnPurchaseId === o.purchaseId;
      return {
        purchaseId: o.purchaseId,
        turnIndex: o.turnIndex,
        position: o.turnIndex + 1,
        buyerUsername: o.buyerUsername,
        boughtTeamLabel: o.boughtTeamLabel,
        draftedTeamLabel: drafted,
        state: drafted ? ("done" as const) : current ? ("current" as const) : ("upcoming" as const),
        mine: Boolean(draft.viewerPurchaseId && draft.viewerPurchaseId === o.purchaseId),
      };
    });
}

export type Sweet16BuyerResult = { buyerUsername: string | null; teams: string[] };

/** Final result: each buyer with the team(s) they bought and drafted, in draft order. */
export function sweet16BuyerResults(draft: Sweet16Draft | null): Sweet16BuyerResult[] {
  const out: Sweet16BuyerResult[] = [];
  const byBuyer = new Map<string, Sweet16BuyerResult>();
  for (const row of sweet16OrderRows(draft)) {
    const key = row.buyerUsername?.toLowerCase() ?? `purchase:${row.purchaseId}`;
    let entry = byBuyer.get(key);
    if (!entry) {
      entry = { buyerUsername: row.buyerUsername, teams: [] };
      byBuyer.set(key, entry);
      out.push(entry);
    }
    if (row.boughtTeamLabel) entry.teams.push(row.boughtTeamLabel);
    if (row.draftedTeamLabel) entry.teams.push(row.draftedTeamLabel);
  }
  return out;
}

/**
 * Whether the pick sheet should pop up on its own. It does once per turn that belongs to the
 * viewer: a buyer who owns several teams is prompted for each turn, but one who dismissed the
 * sheet is not re-prompted for the same turn when the next poll lands.
 */
export function nextTurnPrompt(
  lastPromptedKey: string | null,
  turnKey: string | null,
): { open: boolean; nextKey: string | null } {
  if (!turnKey) return { open: false, nextKey: null };
  if (turnKey === lastPromptedKey) return { open: false, nextKey: lastPromptedKey };
  return { open: true, nextKey: turnKey };
}

/** Friendly copy for a failed draft call, keyed on the server's error code. */
export function sweet16ErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Sweet16RequestError) {
    switch (e.code) {
      case "NOT_READY":
        return "All 16 teams must be sold before you can randomize the order.";
      case "PAYMENTS_PENDING":
        return "A buyer's payment is still processing. Try again in a moment.";
      case "ORDER_ALREADY_SET":
        return "The draft order is already set.";
      case "NO_PAID_SLOTS":
        return "No paid teams yet — there is nobody to put in the order.";
      case "POOL_TOO_SMALL":
        return "Not enough unsold teams are left to draft from.";
      case "ORDER_NOT_SET":
        return "Randomize the draft order first.";
      case "ALREADY_STARTED":
        return "The draft has already started.";
      default:
        return e.message || fallback;
    }
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

async function readDraft(res: Response): Promise<Sweet16Draft> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const j = (body ?? {}) as { draft?: Sweet16Draft; error?: unknown; code?: unknown };
  if (!res.ok) {
    throw new Sweet16RequestError(
      res.status,
      typeof j.error === "string" && j.error.trim() ? j.error : `Request failed (${res.status}).`,
      typeof j.code === "string" ? j.code : undefined,
    );
  }
  if (!j.draft) throw new Sweet16RequestError(res.status, "Unexpected response from the server.");
  return j.draft;
}

function draftUrl(liveRoomId: string, itemId: string, suffix = ""): string {
  return `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}/sweet16-draft${suffix}`;
}

/** Any viewer: current draft state. `null` while the host has not started it yet. */
export async function fetchSweet16Draft(liveRoomId: string, itemId: string): Promise<Sweet16Draft | null> {
  const res = await fetch(draftUrl(liveRoomId, itemId), { cache: "no-store" });
  if (res.status === 404) return null;
  return readDraft(res);
}

/** Host, step 1: randomize the buyers into draft order once 16 teams are sold. */
export async function randomizeSweet16Order(liveRoomId: string, itemId: string): Promise<Sweet16Draft> {
  const res = await fetch(draftUrl(liveRoomId, itemId, "/randomize-order"), { method: "POST" });
  return readDraft(res);
}

/** Host, step 2: open the first buyer's turn after the order is set. */
export async function startSweet16Draft(liveRoomId: string, itemId: string): Promise<Sweet16Draft> {
  const res = await fetch(draftUrl(liveRoomId, itemId, "/start"), { method: "POST" });
  return readDraft(res);
}

/** Buyer: pick a team on your own turn. */
export async function pickSweet16Team(liveRoomId: string, itemId: string, teamLabel: string): Promise<Sweet16Draft> {
  const res = await fetch(draftUrl(liveRoomId, itemId, "/pick"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamLabel }),
  });
  return readDraft(res);
}
