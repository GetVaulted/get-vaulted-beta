/**
 * Browser-side helpers for the Sweet 16 live draft: typed fetch wrappers for the three draft
 * endpoints plus the small pure rules the UI derives from a draft snapshot (turn ownership,
 * countdown text, progress). The server stays authoritative -- every rule here only decides what
 * to show, never what is allowed.
 */
import type { Sweet16DraftDto } from "@/lib/live-sweet16-draft";

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
    return { text: opts.isHost ? "Start Sweet 16 draft" : "Sweet 16 draft · waiting for host", tone: "idle" };
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

/** Host: start the draft once every slot is sold. */
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
