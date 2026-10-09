"use client";

import { useEffect, useRef, useState } from "react";

/** Matches the server PATCH trim + slice on live room `showNotes` (and the app's limit). */
export const HOST_SHOW_NOTES_MAX_CHARS = 4000;

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  /** Notes currently saved on the show (from the host console). */
  initialNotes: string;
  /** Called with the saved text after a successful save. */
  onSaved: (notes: string) => void;
};

/**
 * Seller "Show notes" editor — same notes as the app's Show notes sheet (live room `showNotes`).
 * Buyers open these from the show during the stream.
 */
export function HostShowNotesModal(props: Props) {
  // Mount the editor only while open so its text always starts from the saved notes.
  if (!props.open) return null;
  return <HostShowNotesEditor {...props} />;
}

function HostShowNotesEditor({ onClose, roomId, initialNotes, onSaved }: Props) {
  const [draft, setDraft] = useState(() => initialNotes.trim());
  const [saved, setSaved] = useState(() => initialNotes.trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => areaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const dirty = draft.trim() !== saved;
  const remaining = HOST_SHOW_NOTES_MAX_CHARS - draft.length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = draft.trim().slice(0, HOST_SHOW_NOTES_MAX_CHARS);
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showNotes: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Could not save show notes.");
        return;
      }
      setSaved(next);
      setDraft(next);
      onSaved(next);
      onClose();
    } catch {
      setError("Could not save show notes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Show notes"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="max-h-[min(92dvh,760px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Show brief</p>
            <h2 className="mt-1 text-lg font-bold text-zinc-50">Show notes</h2>
            <p className="mt-1 text-xs text-zinc-400">Buyers open this from your show. Same notes as in the app.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <label htmlFor="host-show-notes" className="sr-only">
          Show notes
        </label>
        <textarea
          id="host-show-notes"
          ref={areaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, HOST_SHOW_NOTES_MAX_CHARS))}
          maxLength={HOST_SHOW_NOTES_MAX_CHARS}
          rows={10}
          disabled={saving}
          placeholder="Shipping rules, pull order, giveaway details, house rules…"
          className="mt-4 w-full resize-y rounded-xl border border-white/12 bg-black/60 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/40 disabled:opacity-60"
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{remaining} left</span>
          {error ? (
            <span role="alert" className="text-rose-300">
              {error}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/30 via-amber-400/25 to-yellow-300/20 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-50 transition hover:from-amber-500/40 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save notes"}
          </button>
          <button
            type="button"
            onClick={() => setDraft("")}
            disabled={saving || !draft}
            className="rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
