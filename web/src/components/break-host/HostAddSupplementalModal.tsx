"use client";

import { useEffect, useState } from "react";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  parentItem: LiveRoomItemDTO;
  busy?: boolean;
  onSubmit: (payload: {
    name: string;
    priceUsd: number;
    spotCount: number;
    feedsIntoTitle: string;
  }) => Promise<boolean>;
};

export function HostAddSupplementalModal({ open, onClose, parentItem, busy, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [spotCount, setSpotCount] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPriceUsd("");
    setSpotCount("1");
    setError(null);
    setSubmitting(false);
  }, [open, parentItem.id]);

  if (!open) return null;

  const parentTitle = parentItem.displayTitle?.trim() || parentItem.title;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    const price = Number(priceUsd);
    const spots = Math.floor(Number(spotCount));
    if (!trimmed) {
      setError("Enter a supplemental name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price per spot.");
      return;
    }
    if (!Number.isFinite(spots) || spots < 1 || spots > 64) {
      setError("Spot count must be between 1 and 64.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onSubmit({
        name: trimmed,
        priceUsd: price,
        spotCount: spots,
        feedsIntoTitle: parentTitle,
      });
      if (ok) onClose();
      else setError("Could not add supplemental.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl ring-1 ring-amber-400/15"
        role="dialog"
        aria-labelledby="host-supp-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p id="host-supp-title" className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">
              Add supplemental
            </p>
            <p className="mt-1 text-sm font-bold text-white">New spots on active lot</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || busy}
            className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Feeds into (main item)
          <input
            readOnly
            value={parentTitle}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200"
          />
        </label>

        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Supplemental name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Extra random"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Price / spot ($)
            <input
              inputMode="decimal"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              placeholder="25"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            # of spots
            <input
              inputMode="numeric"
              value={spotCount}
              onChange={(e) => setSpotCount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
            />
          </label>
        </div>

        <p className="mt-2 text-[10px] leading-snug text-zinc-500">
          Spots are added to the active item&apos;s board — buyers see them immediately on the same lot.
        </p>

        {error ? <p className="mt-2 text-[11px] font-semibold text-rose-300">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || busy}
            className="flex-1 rounded-xl border border-white/15 bg-black/45 py-2.5 text-[11px] font-black uppercase tracking-wide text-zinc-200 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || busy}
            className="flex-1 rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/30 to-yellow-300/20 py-2.5 text-[11px] font-black uppercase tracking-wide text-amber-50 disabled:opacity-40"
          >
            {submitting ? "Adding…" : "Add supplemental"}
          </button>
        </div>
      </div>
    </div>
  );
}
