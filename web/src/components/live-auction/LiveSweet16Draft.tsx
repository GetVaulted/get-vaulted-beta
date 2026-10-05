"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSweet16Draft } from "@/hooks/useSweet16Draft";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import {
  SWEET16_URGENT_MS,
  Sweet16RequestError,
  draftPillState,
  draftProgress,
  formatDraftCountdown,
  isViewerTurn,
  pickSweet16Team,
  startSweet16Draft,
  turnRemainingMs,
  viewerTurnKey,
} from "@/lib/sweet16-draft-client";

const GOLD = "var(--gold, #cba35c)";

type Props = {
  liveRoomId: string;
  items: LiveRoomItemDTO[];
  /** Viewer is the host of this room: gets the Start button and spectates. */
  isHost: boolean;
  roomEnded: boolean;
  /** Fired once when the draft completes, so the room can refetch revealed teams. */
  onDraftComplete?: () => void;
};

/**
 * Sweet 16 Break on the web: a floating launcher plus a pick sheet, mirroring the phone app's
 * draft sheet so a buyer on a PC can take part. Appears only for the active draft-mode lot once
 * all 16 slots have sold. The sheet opens by itself when it becomes the viewer's turn; picking
 * is select-then-confirm because a pick can't be undone.
 */
export function LiveSweet16Draft({ liveRoomId, items, isHost, roomEnded, onDraftComplete }: Props) {
  const item = useMemo(
    () => items.find((i) => i.variantAssignmentMode === "draft" && i.status === "active") ?? null,
    [items],
  );
  const itemId = item?.id ?? null;
  const ready = Boolean(item?.variantBreakReadyAt);

  const { draft, setDraft, loading, error: loadError, refresh } = useSweet16Draft({
    liveRoomId,
    itemId,
    enabled: ready && !roomEnded,
  });

  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastTurnKeyRef = useRef<string | null>(null);
  const completeNotifiedRef = useRef<string | null>(null);

  // A different lot is a different draft.
  useEffect(() => {
    setOpen(false);
    setSelected(null);
    setActionError(null);
    lastTurnKeyRef.current = null;
    completeNotifiedRef.current = null;
  }, [itemId]);

  // Tick the countdown only while a turn is running.
  const running = draft?.status === "in_progress";
  useEffect(() => {
    if (!running) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Open the sheet when a turn becomes the viewer's (once per turn, so a buyer who owns several
  // slots is prompted for each one and a buyer who closes the sheet isn't re-nagged mid-turn).
  const turnKey = viewerTurnKey(draft);
  useEffect(() => {
    if (!turnKey) {
      lastTurnKeyRef.current = null;
      return;
    }
    if (lastTurnKeyRef.current === turnKey) return;
    lastTurnKeyRef.current = turnKey;
    setSelected(null);
    setActionError(null);
    setOpen(true);
  }, [turnKey]);

  useEffect(() => {
    if (draft?.status === "complete" && completeNotifiedRef.current !== draft.itemId) {
      completeNotifiedRef.current = draft.itemId;
      onDraftComplete?.();
    }
  }, [draft?.status, draft?.itemId, onDraftComplete]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!item || !ready) return null;

  const myTurn = isViewerTurn(draft);
  const remainingMs = turnRemainingMs(draft, nowMs);
  const urgent = remainingMs != null && remainingMs <= SWEET16_URGENT_MS;
  const pill = draftPillState(draft, nowMs, { isHost });
  const notStarted = !draft || draft.status === "not_started";
  const { current, total } = draftProgress(draft);

  const confirmPick = async () => {
    if (!itemId || !selected || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await pickSweet16Team(liveRoomId, itemId, selected);
      setDraft(next);
      setSelected(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not record your pick.");
      setSelected(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const startDraft = async () => {
    if (!itemId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await startSweet16Draft(liveRoomId, itemId);
      setDraft(next);
      setOpen(true);
    } catch (e) {
      if (e instanceof Sweet16RequestError && e.code === "ALREADY_STARTED") {
        void refresh();
        setOpen(true);
      } else {
        setActionError(e instanceof Error ? e.message : "Could not start the draft.");
      }
    } finally {
      setBusy(false);
    }
  };

  const pillStyle =
    pill.tone === "urgent"
      ? { borderColor: "#ff6b6b", color: "#ffd9d9", backgroundColor: "rgba(255,107,107,0.18)" }
      : pill.tone === "turn"
        ? { borderColor: GOLD, color: "#111", backgroundColor: GOLD }
        : { borderColor: "rgba(203,163,92,0.45)", color: GOLD, backgroundColor: "rgba(12,12,14,0.92)" };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-24 right-3 z-40 max-w-[calc(100vw-1.5rem)] truncate rounded-full border px-4 py-2.5 text-xs font-extrabold shadow-lg shadow-black/50 backdrop-blur sm:bottom-6 sm:right-6 ${
          pill.tone === "turn" || pill.tone === "urgent" ? "animate-pulse motion-reduce:animate-none" : ""
        }`}
        style={pillStyle}
        aria-label="Open the Sweet 16 draft"
      >
        {pill.text}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            onClick={() => setOpen(false)}
            aria-label="Close the Sweet 16 draft"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sweet16-draft-title"
            className="relative max-h-[86vh] w-full overflow-y-auto rounded-t-2xl border bg-[#0c0c0e] p-4 sm:max-w-lg sm:rounded-2xl"
            style={{ borderColor: "rgba(203,163,92,0.3)" }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="sweet16-draft-title" className="text-lg font-black text-zinc-100">
                  Sweet 16 Draft
                </h2>
                <p className="mt-0.5 truncate text-xs text-zinc-400">{item.displayTitle || item.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-9 rounded-lg px-3 text-sm font-bold hover:bg-white/10"
                style={{ color: GOLD }}
              >
                Close
              </button>
            </div>

            {loading && !draft ? (
              <p className="py-8 text-center text-sm text-zinc-400">Loading the draft…</p>
            ) : loadError && !draft ? (
              <p className="py-8 text-center text-sm text-red-400">{loadError}</p>
            ) : notStarted ? (
              <div className="py-6 text-center">
                {isHost ? (
                  <>
                    <p className="text-sm text-zinc-300">
                      All 16 slots are sold. Starting shuffles the pick order and gives each buyer 60 seconds on their turn.
                    </p>
                    <button
                      type="button"
                      onClick={() => void startDraft()}
                      disabled={busy}
                      className="mt-4 min-h-11 rounded-lg px-5 text-sm font-extrabold text-zinc-950 disabled:opacity-50"
                      style={{ backgroundColor: GOLD }}
                    >
                      {busy ? "Starting…" : "Start the draft"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400">Waiting for the host to start the draft…</p>
                )}
              </div>
            ) : draft ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-zinc-300">
                    Pick {current} of {total}
                  </p>
                  {draft.status === "in_progress" && remainingMs != null ? (
                    <span
                      className="rounded-full border px-3 py-1 text-sm font-black tabular-nums"
                      style={
                        urgent
                          ? { borderColor: "rgba(255,107,107,0.5)", backgroundColor: "rgba(255,107,107,0.18)", color: "#ff9d9d" }
                          : { borderColor: "rgba(203,163,92,0.4)", backgroundColor: "rgba(203,163,92,0.18)", color: GOLD }
                      }
                      role="timer"
                      aria-label="Time left on this turn"
                    >
                      {formatDraftCountdown(remainingMs)}
                    </span>
                  ) : null}
                </div>

                {draft.status === "complete" ? (
                  <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-300">
                    Draft complete. Every slot has a team.
                  </p>
                ) : myTurn ? (
                  <p
                    className="rounded-lg px-3 py-2 text-sm font-extrabold text-zinc-950"
                    style={{ backgroundColor: GOLD }}
                    aria-live="polite"
                  >
                    Your turn. Pick a team.
                  </p>
                ) : (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300" aria-live="polite">
                    Waiting for {draft.currentTurnBuyerUsername ? `@${draft.currentTurnBuyerUsername}` : "the next buyer"} to pick…
                  </p>
                )}

                {draft.status === "in_progress" && remainingMs != null && remainingMs <= 0 ? (
                  <p className="text-xs text-zinc-400">Time&apos;s up. A team is being assigned.</p>
                ) : null}

                {draft.status === "in_progress" && myTurn ? (
                  <div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {draft.remainingTeamLabels.map((label) => {
                        const active = selected === label;
                        return (
                          <button
                            key={label}
                            type="button"
                            disabled={busy}
                            aria-pressed={active}
                            onClick={() => setSelected(active ? null : label)}
                            className="min-h-10 rounded-lg border px-2 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                            style={
                              active
                                ? { borderColor: GOLD, backgroundColor: "rgba(203,163,92,0.22)" }
                                : { borderColor: "rgba(255,255,255,0.15)" }
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => void confirmPick()}
                      disabled={!selected || busy}
                      className="mt-3 min-h-11 w-full rounded-lg text-sm font-extrabold text-zinc-950 disabled:opacity-40"
                      style={{ backgroundColor: GOLD }}
                    >
                      {busy ? "Locking in…" : selected ? `Lock in ${selected}` : "Choose a team"}
                    </button>
                  </div>
                ) : null}

                {actionError ? (
                  <p className="text-sm text-red-400" role="alert">
                    {actionError}
                  </p>
                ) : null}

                {draft.picks.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-zinc-500">Picks so far</p>
                    <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                      {[...draft.picks]
                        .sort((a, b) => b.turnIndex - a.turnIndex)
                        .map((p) => (
                          <li key={p.purchaseId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate font-semibold text-zinc-100">{p.teamLabel}</span>
                            <span className="shrink-0 text-xs text-zinc-400">
                              {p.buyerUsername ? `@${p.buyerUsername}` : "unknown"}
                              {p.autoAssigned ? " · auto" : ""}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {notStarted && actionError ? (
              <p className="text-center text-sm text-red-400" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
