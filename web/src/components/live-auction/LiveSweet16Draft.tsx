"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSweet16Draft } from "@/hooks/useSweet16Draft";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import type { Sweet16BoardTile } from "@/lib/live-sweet16-draft-logic";
import {
  SWEET16_URGENT_MS,
  Sweet16RequestError,
  draftPillState,
  draftProgress,
  formatDraftCountdown,
  isSweet16TileSelectable,
  isViewerTurn,
  nextTurnPrompt,
  pickSweet16Team,
  randomizeSweet16Order,
  startSweet16Draft,
  sweet16Board,
  sweet16BoardCounts,
  sweet16BuyerResults,
  sweet16ErrorMessage,
  sweet16OrderRows,
  sweet16TileCaption,
  turnRemainingMs,
  viewerTurnKey,
} from "@/lib/sweet16-draft-client";

const GOLD = "var(--gold, #cba35c)";

type Props = {
  liveRoomId: string;
  items: LiveRoomItemDTO[];
  /** Viewer is the host of this room: gets the Randomize order / Start draft buttons. */
  isHost: boolean;
  roomEnded: boolean;
  /** Fired once when the draft completes, so the room can refetch revealed teams. */
  onDraftComplete?: () => void;
  /** Bump on a realtime draft event (order set / started / pick / complete) to refetch right away. */
  refreshKey?: number;
};

/**
 * Sweet 16 Break on the web. The board shows all 32 teams; once 16 are sold sales stop, the host
 * randomizes the buyers into a draft order (tap 1) and starts the draft (tap 2), and each buyer
 * then gets a pop-up on their turn to pick one of the 16 teams nobody bought. A floating launcher
 * opens the sheet; the sheet opens by itself when it becomes the viewer's turn. Picking is
 * select-then-confirm because a pick can't be undone. The server stays the gate for every action.
 */
export function LiveSweet16Draft({ liveRoomId, items, isHost, roomEnded, onDraftComplete, refreshKey = 0 }: Props) {
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
    refreshKey,
  });

  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastTurnKeyRef = useRef<string | null>(null);
  const completeNotifiedRef = useRef<string | null>(null);
  const prevReadyRef = useRef<{ itemId: string | null; ready: boolean } | null>(null);

  // A different lot is a different draft.
  useEffect(() => {
    setOpen(false);
    setSelected(null);
    setActionError(null);
    lastTurnKeyRef.current = null;
    completeNotifiedRef.current = null;
    prevReadyRef.current = null;
  }, [itemId]);

  // The host watching the 16th team sell gets the sheet (and its Randomize button) put in front of
  // them. Only on a live false -> true flip, so reloading the page doesn't pop it open again.
  useEffect(() => {
    const prev = prevReadyRef.current;
    prevReadyRef.current = { itemId, ready };
    if (isHost && ready && prev && prev.itemId === itemId && !prev.ready) setOpen(true);
  }, [isHost, itemId, ready]);

  // Tick the countdown only while a turn is running.
  const running = draft?.status === "in_progress";
  useEffect(() => {
    if (!running) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Pop the sheet open when a turn becomes the viewer's -- once per turn, so a buyer who owns
  // several teams is prompted for each one and a buyer who closes the sheet isn't re-nagged
  // mid-turn.
  const turnKey = viewerTurnKey(draft);
  useEffect(() => {
    const { open: shouldOpen, nextKey } = nextTurnPrompt(lastTurnKeyRef.current, turnKey);
    lastTurnKeyRef.current = nextKey;
    if (!shouldOpen) return;
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

  const board = useMemo(() => sweet16Board(draft, item), [draft, item]);
  const orderRows = useMemo(() => sweet16OrderRows(draft), [draft]);
  const results = useMemo(() => (draft?.status === "complete" ? sweet16BuyerResults(draft) : []), [draft]);

  if (!item || !ready) return null;

  const status = draft?.status ?? "not_started";
  const noOrderYet = status === "not_started";
  const orderSet = status === "order_set";
  const inProgress = status === "in_progress";
  const complete = status === "complete";
  const myTurn = isViewerTurn(draft);
  const activeSelected = myTurn ? selected : null;
  const remainingMs = turnRemainingMs(draft, nowMs);
  const urgent = remainingMs != null && remainingMs <= SWEET16_URGENT_MS;
  const pill = draftPillState(draft, nowMs, { isHost });
  const hostHasAction = isHost && (noOrderYet || orderSet);
  const { current, total } = draftProgress(draft);
  const counts = sweet16BoardCounts(board);
  const turnSeconds = draft?.turnSeconds ?? 60;
  const waitingOn = draft?.currentTurnBuyerUsername ? `@${draft.currentTurnBuyerUsername}` : "the next buyer";

  const run = async (call: () => Promise<NonNullable<typeof draft>>, failure: string, benignCode?: string) => {
    if (!itemId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      setDraft(await call());
    } catch (e) {
      if (benignCode && e instanceof Sweet16RequestError && e.code === benignCode) {
        void refresh();
      } else {
        setActionError(sweet16ErrorMessage(e, failure));
      }
    } finally {
      setBusy(false);
    }
  };

  const randomizeOrder = () =>
    run(() => randomizeSweet16Order(liveRoomId, itemId!), "Could not randomize the order.", "ORDER_ALREADY_SET");

  const startDraft = () =>
    run(() => startSweet16Draft(liveRoomId, itemId!), "Could not start the draft.", "ALREADY_STARTED");

  const confirmPick = async () => {
    if (!itemId || !activeSelected || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await pickSweet16Team(liveRoomId, itemId, activeSelected);
      setDraft(next);
      setSelected(null);
    } catch (e) {
      setActionError(sweet16ErrorMessage(e, "Could not record your pick."));
      setSelected(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const pillStyle =
    pill.tone === "urgent"
      ? { borderColor: "#ff6b6b", color: "#ffd9d9", backgroundColor: "rgba(255,107,107,0.18)" }
      : pill.tone === "turn" || hostHasAction
        ? { borderColor: GOLD, color: "#111", backgroundColor: GOLD }
        : { borderColor: "rgba(203,163,92,0.45)", color: GOLD, backgroundColor: "rgba(12,12,14,0.92)" };

  const clock =
    inProgress && remainingMs != null ? (
      <span
        className="shrink-0 rounded-full border px-3 py-1 text-sm font-black tabular-nums"
        style={
          urgent
            ? { borderColor: "rgba(255,107,107,0.6)", backgroundColor: "rgba(255,107,107,0.2)", color: "#ff9d9d" }
            : { borderColor: "rgba(203,163,92,0.4)", backgroundColor: "rgba(203,163,92,0.18)", color: GOLD }
        }
        role="timer"
        aria-label="Time left on this turn"
      >
        {formatDraftCountdown(remainingMs)}
      </span>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-24 right-3 z-40 max-w-[calc(100vw-1.5rem)] truncate rounded-full border px-4 py-2.5 text-xs font-extrabold shadow-lg shadow-black/50 backdrop-blur sm:bottom-6 sm:right-6 ${
          pill.tone === "turn" || pill.tone === "urgent" || hostHasAction
            ? "animate-pulse motion-reduce:animate-none"
            : ""
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
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            aria-label="Close the Sweet 16 draft"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sweet16-draft-title"
            className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border bg-[#0c0c0e] sm:max-w-2xl sm:rounded-2xl"
            style={{ borderColor: myTurn ? GOLD : "rgba(203,163,92,0.3)" }}
          >
            <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-4">
              <div className="min-w-0 flex-1">
                <h2 id="sweet16-draft-title" className="text-lg font-black text-zinc-100">
                  Sweet 16 Draft
                </h2>
                <p className="mt-0.5 truncate text-xs text-zinc-400">{item.displayTitle || item.title}</p>
              </div>
              {!myTurn ? clock : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-9 rounded-lg px-3 text-sm font-bold hover:bg-white/10"
                style={{ color: GOLD }}
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {loading && !draft ? (
                <p className="py-8 text-center text-sm text-zinc-400">Loading the draft…</p>
              ) : loadError && !draft ? (
                <p className="py-8 text-center text-sm text-red-400">{loadError}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Stage banner */}
                  {myTurn ? (
                    <div
                      className="rounded-xl px-4 py-3 text-zinc-950"
                      style={{ backgroundColor: GOLD }}
                      aria-live="assertive"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-2xl font-black uppercase tracking-wide">Your pick</p>
                        {remainingMs != null ? (
                          <span
                            className={`rounded-full px-3 py-1 text-lg font-black tabular-nums ${
                              urgent ? "bg-red-600 text-white" : "bg-black/80 text-white"
                            }`}
                            role="timer"
                            aria-label="Time left on your turn"
                          >
                            {formatDraftCountdown(remainingMs)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-bold">
                        Tap a team below, then confirm. {counts.open} open team{counts.open === 1 ? "" : "s"} left.
                      </p>
                    </div>
                  ) : complete ? (
                    <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-300">
                      Draft complete. Every buyer has their teams.
                    </p>
                  ) : inProgress ? (
                    <p
                      className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300"
                      aria-live="polite"
                    >
                      Waiting for <span className="font-extrabold text-zinc-100">{waitingOn}</span> to pick…
                      <span className="ml-2 text-xs text-zinc-500">
                        Pick {current} of {total}
                      </span>
                    </p>
                  ) : orderSet ? (
                    isHost ? (
                      <div className="rounded-xl border p-3 text-center" style={{ borderColor: "rgba(203,163,92,0.45)" }}>
                        <p className="text-sm text-zinc-300">
                          The order is set and everyone can see it. Start the draft to put the first buyer on the
                          clock ({turnSeconds} seconds per pick).
                        </p>
                        <button
                          type="button"
                          onClick={() => void startDraft()}
                          disabled={busy}
                          className="mt-3 min-h-12 w-full rounded-lg px-5 text-base font-black text-zinc-950 disabled:opacity-50"
                          style={{ backgroundColor: GOLD }}
                        >
                          {busy ? "Starting…" : "Start draft"}
                        </button>
                      </div>
                    ) : (
                      <p className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300" aria-live="polite">
                        Draft order is set. Waiting for the host to start the draft…
                      </p>
                    )
                  ) : isHost ? (
                    <div className="rounded-xl border p-3 text-center" style={{ borderColor: "rgba(203,163,92,0.45)" }}>
                      <p className="text-sm text-zinc-300">
                        All 16 teams are sold. Randomize the buyers into a draft order — everyone will see it — then
                        start the draft.
                      </p>
                      <button
                        type="button"
                        onClick={() => void randomizeOrder()}
                        disabled={busy}
                        className="mt-3 min-h-12 w-full rounded-lg px-5 text-base font-black text-zinc-950 disabled:opacity-50"
                        style={{ backgroundColor: GOLD }}
                      >
                        {busy ? "Randomizing…" : "Randomize order"}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300" aria-live="polite">
                      All 16 teams are sold. Waiting for the host to randomize the draft order…
                    </p>
                  )}

                  {inProgress && remainingMs != null && remainingMs <= 0 ? (
                    <p className="text-xs text-zinc-400">Time&apos;s up. A team is being assigned.</p>
                  ) : null}

                  {actionError ? (
                    <p className="text-sm text-red-400" role="alert">
                      {actionError}
                    </p>
                  ) : null}

                  {/* Draft order */}
                  {orderRows.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-zinc-500">Draft order</p>
                      <ol className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
                        {orderRows.map((row) => (
                          <li
                            key={row.purchaseId}
                            className="flex items-center gap-3 px-3 py-2 text-sm"
                            style={row.state === "current" ? { backgroundColor: "rgba(203,163,92,0.18)" } : undefined}
                            aria-current={row.state === "current" ? "step" : undefined}
                          >
                            <span
                              className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums"
                              style={
                                row.state === "current"
                                  ? { backgroundColor: GOLD, color: "#111" }
                                  : { backgroundColor: "rgba(255,255,255,0.08)", color: "#d4d4d8" }
                              }
                            >
                              {row.position}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold text-zinc-100">
                                {row.buyerUsername ? `@${row.buyerUsername}` : "Buyer"}
                                {row.mine ? <span style={{ color: GOLD }}> · you</span> : null}
                              </span>
                              <span className="block truncate text-xs text-zinc-400">
                                {row.boughtTeamLabel ? `Bought ${row.boughtTeamLabel}` : "Bought a team"}
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-xs font-bold">
                              {row.state === "done" ? (
                                <span className="text-emerald-300">Drafted {row.draftedTeamLabel}</span>
                              ) : row.state === "current" ? (
                                <span style={{ color: urgent ? "#ff9d9d" : GOLD }}>
                                  On the clock{remainingMs != null ? ` · ${formatDraftCountdown(remainingMs)}` : ""}
                                </span>
                              ) : (
                                <span className="text-zinc-500">Up next</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {/* Final result */}
                  {complete && results.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-zinc-500">Final teams</p>
                      <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
                        {results.map((r) => (
                          <li key={r.buyerUsername ?? r.teams.join("|")} className="px-3 py-2 text-sm">
                            <p className="font-bold text-zinc-100">{r.buyerUsername ? `@${r.buyerUsername}` : "Buyer"}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {r.teams.map((team, i) => (
                                <span
                                  key={`${team}-${i}`}
                                  className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-zinc-100"
                                  style={{ borderColor: "rgba(203,163,92,0.4)", backgroundColor: "rgba(203,163,92,0.12)" }}
                                >
                                  {team}
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* The full 32 team board: the draft pool is the open tiles. */}
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                        {myTurn ? "Pick a team" : "All 32 teams"}
                      </p>
                      <p className="text-[11px] font-semibold text-zinc-500">
                        {counts.open} open · {counts.purchased} bought · {counts.drafted} drafted
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {board.map((tile) => (
                        <BoardTile
                          key={tile.label}
                          tile={tile}
                          pickable={myTurn && !busy && isSweet16TileSelectable(draft, tile)}
                          pickMode={myTurn}
                          active={activeSelected === tile.label}
                          onToggle={() =>
                            setSelected((prev) => (prev === tile.label ? null : tile.label))
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {myTurn ? (
              <div className="shrink-0 border-t border-white/10 bg-[#0c0c0e] px-4 py-3">
                <button
                  type="button"
                  onClick={() => void confirmPick()}
                  disabled={!activeSelected || busy}
                  className="min-h-12 w-full rounded-lg text-base font-black text-zinc-950 disabled:opacity-40"
                  style={{ backgroundColor: GOLD }}
                >
                  {busy ? "Locking in…" : activeSelected ? `Draft ${activeSelected}` : "Choose a team"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function BoardTile({
  tile,
  pickable,
  pickMode,
  active,
  onToggle,
}: {
  tile: Sweet16BoardTile;
  /** The viewer is on the clock and this tile can be drafted. */
  pickable: boolean;
  /** The viewer is on the clock (taken tiles dim further so the open ones stand out). */
  pickMode: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  const taken = tile.state !== "open";
  const style = active
    ? { borderColor: GOLD, backgroundColor: "rgba(203,163,92,0.25)" }
    : tile.state === "drafted"
      ? { borderColor: "rgba(203,163,92,0.4)", backgroundColor: "rgba(203,163,92,0.08)" }
      : tile.state === "purchased"
        ? { borderColor: "rgba(52,211,153,0.3)", backgroundColor: "rgba(6,78,59,0.25)" }
        : { borderColor: pickable ? "rgba(203,163,92,0.55)" : "rgba(255,255,255,0.15)" };
  return (
    <button
      type="button"
      disabled={!pickable}
      aria-pressed={pickable ? active : undefined}
      aria-label={`${tile.label}: ${sweet16TileCaption(tile)}`}
      onClick={onToggle}
      className={`min-h-14 rounded-lg border px-2 py-1.5 text-left transition disabled:cursor-default ${
        pickable ? "hover:bg-white/10" : ""
      } ${taken && pickMode ? "opacity-50" : ""}`}
      style={style}
    >
      <span className={`block truncate text-xs font-bold ${taken ? "text-zinc-300" : "text-zinc-100"}`}>
        {tile.label}
      </span>
      <span
        className={`block truncate text-[10px] font-semibold ${
          tile.state === "drafted" ? "text-amber-200/90" : tile.state === "purchased" ? "text-emerald-300/90" : "text-zinc-500"
        }`}
      >
        {sweet16TileCaption(tile)}
      </span>
    </button>
  );
}
