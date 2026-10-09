"use client";

import { useEffect, useRef, useState } from "react";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import type { LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";
import { notifyLiveDiscoveryChanged } from "@/lib/notify-live-discovery-changed";
import { uploadListingImageBlob } from "@/lib/upload-listing-image-client";

const COVER_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_MAX_BYTES = 20 * 1024 * 1024;
const MINUTES = ["00", "15", "30", "45"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Split an ISO start time into local date / hour / quarter-hour minute (rounded up), or blanks. */
function scheduleParts(iso: string | null) {
  const parsed = iso ? new Date(iso) : null;
  const d = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 15;
  if (rem !== 0) d.setMinutes(d.getMinutes() + (15 - rem));
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    hour: pad2(d.getHours()),
    minute: pad2(d.getMinutes()),
  };
}

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2 focus:ring-gold/15";
const labelCls = "text-xs font-bold uppercase tracking-wide text-zinc-500";

type Props = {
  room: LiveRoomListApiRow;
  onClose: () => void;
  /** Called after a successful save so the page can reload its show list. */
  onSaved: () => void;
};

/**
 * Edit a scheduled show's public details (title, description, cover, start time) — same fields as the
 * app's "Edit show". Mount it only while editing; it seeds its fields from `room` once.
 */
export function EditScheduledShowModal({ room, onClose, onSaved }: Props) {
  const initial = scheduleParts(room.scheduledStartAt);
  const originalIso = room.scheduledStartAt;
  const [title, setTitle] = useState(room.title);
  const [description, setDescription] = useState(room.description ?? "");
  const [cover, setCover] = useState(room.thumbnailUrl ?? "");
  const [coverUploading, setCoverUploading] = useState(false);
  const [date, setDate] = useState(initial.date);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const uploadCover = async (file: File) => {
    setError(null);
    if (!COVER_ALLOWED.has(file.type)) {
      setError("Use a JPG, PNG, or WebP image for the cover.");
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError("Cover image must be 20MB or smaller.");
      return;
    }
    setCoverUploading(true);
    try {
      const blob = await compressImageFileToBlob(file, 1280, 0.86);
      setCover(await uploadListingImageBlob(blob, "live-thumbnail.jpg"));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not upload cover image.");
    } finally {
      setCoverUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError("Give your show a title of at least 3 characters.");
      return;
    }
    if (!date) {
      setError("Choose a date for your show.");
      return;
    }
    const at = new Date(`${date}T${hour}:${minute}`);
    if (Number.isNaN(at.getTime())) {
      setError("That date and time is not valid.");
      return;
    }
    // Only send a new time when it changed, so a title-only edit never fails on an already-near start.
    const startChanged = !originalIso || Math.abs(at.getTime() - new Date(originalIso).getTime()) >= 60_000;
    if (startChanged && at.getTime() < Date.now() + 60_000) {
      setError("Schedule your show at least a minute in the future.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(room.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: description.trim(),
          thumbnailUrl: cover.trim(),
          ...(startChanged ? { scheduledStartAt: at.toISOString() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Could not save changes.");
        return;
      }
      notifyLiveDiscoveryChanged();
      onSaved();
      onClose();
    } catch {
      setError("Could not save changes. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const coverVisible = /^(https?:\/\/|data:image|\/)/.test(cover.trim());

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Edit show"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="max-h-[min(92dvh,820px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-50">Edit show</h2>
            <p className="mt-1 text-xs text-zinc-400">Update the title, description, cover, and start time.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="edit-show-title" className={labelCls}>
              Event title
            </label>
            <input
              id="edit-show-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              disabled={busy}
              placeholder="e.g. Optic Hobby PYT — 32 spots"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="edit-show-desc" className={labelCls}>
              Description (optional)
            </label>
            <textarea
              id="edit-show-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
              disabled={busy}
              rows={4}
              placeholder="What are you breaking? Any rules or shoutouts?"
              className={`${inputCls} resize-y leading-relaxed`}
            />
          </div>

          <div>
            <span className={labelCls}>Cover image (optional)</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload cover image"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadCover(f);
              }}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {coverVisible ? (
                <div className="w-40 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded public URL, simple preview */}
                  <img src={cover} alt="Cover preview" className="aspect-video w-full object-cover" />
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || coverUploading}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-100 hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {coverUploading ? "Uploading…" : coverVisible ? "Replace image" : "Upload image"}
                </button>
                {coverVisible ? (
                  <button
                    type="button"
                    disabled={busy || coverUploading}
                    onClick={() => setCover("")}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <span className={labelCls}>Start time</span>
            <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15 [color-scheme:dark]"
                />
              </label>
              <label className="min-w-[88px]">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Hour</span>
                <select
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full appearance-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={pad2(h)}>
                      {pad2(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[88px]">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Minute</span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full appearance-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      :{m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">Start times use 15-minute slots, in your local time.</p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || coverUploading || title.trim().length < 3}
            className="rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/30 via-amber-400/25 to-yellow-300/20 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-50 transition hover:from-amber-500/40 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
