"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PullMedia = {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
  durationMs: number | null;
  sortOrder: number;
};

const MAX_PHOTOS = 20;
const MAX_VIDEOS = 5;
const MAX_VIDEO_DURATION_MS = 20_000;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

async function readVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const ms = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      URL.revokeObjectURL(video.src);
      resolve(ms);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Could not read video metadata."));
    };
    video.src = URL.createObjectURL(file);
  });
}

export function SellerPullMediaManager() {
  const [media, setMedia] = useState<PullMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile/pull-media");
    const body = (await res.json().catch(() => null)) as { media?: PullMedia[]; error?: string } | null;
    if (!res.ok || !body?.media) {
      setError(body?.error || "Could not load your pulls.");
      return;
    }
    setMedia(body.media);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const photoCount = media?.filter((m) => m.type === "PHOTO").length ?? 0;
  const videoCount = media?.filter((m) => m.type === "VIDEO").length ?? 0;

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { compressImageFileToBlob } = await import("@/lib/listing-image-compress");
      const compressed = await compressImageFileToBlob(file);
      const form = new FormData();
      form.append("file", compressed, "pull.jpg");
      const res = await fetch("/api/uploads/profile-pull-photo", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { media?: PullMedia; error?: string } | null;
      if (!res.ok || !body?.media) throw new Error(body?.error || "Upload failed.");
      setMedia((prev) => [...(prev ?? []), body.media!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const durationMs = await readVideoDurationMs(file);
      if (durationMs > MAX_VIDEO_DURATION_MS) {
        throw new Error("Pull video must be 20 seconds or shorter.");
      }
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error("Pull video must be 30MB or smaller.");
      }
      const form = new FormData();
      form.append("file", file, file.name || "pull.mp4");
      form.append("durationMs", String(durationMs));
      const res = await fetch("/api/uploads/profile-pull-video", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { media?: PullMedia; error?: string } | null;
      if (!res.ok || !body?.media) throw new Error(body?.error || "Upload failed.");
      setMedia((prev) => [...(prev ?? []), body.media!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    const prev = media;
    setMedia((cur) => (cur ? cur.filter((m) => m.id !== id) : cur));
    const res = await fetch(`/api/profile/pull-media/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setMedia(prev ?? null);
      setError("Could not delete that item.");
    }
  };

  const move = async (id: string, direction: -1 | 1) => {
    if (!media) return;
    const idx = media.findIndex((m) => m.id === id);
    const swapWith = idx + direction;
    if (idx === -1 || swapWith < 0 || swapWith >= media.length) return;
    const next = [...media];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setMedia(next);
    const res = await fetch("/api/profile/pull-media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((m) => m.id) }),
    });
    if (!res.ok) {
      setError("Could not save the new order.");
      void load();
    }
  };

  if (!media && !error) {
    return <p className="text-sm text-zinc-500">Loading your pulls…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || photoCount >= MAX_PHOTOS}
          onClick={() => photoInputRef.current?.click()}
          className="inline-flex h-10 items-center rounded-lg border border-gold/30 bg-gold/10 px-4 text-sm font-semibold text-gold-bright transition hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add photo
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickPhoto(e)} />

        <button
          type="button"
          disabled={busy || videoCount >= MAX_VIDEOS}
          onClick={() => videoInputRef.current?.click()}
          className="inline-flex h-10 items-center rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add video
        </button>
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => void onPickVideo(e)} />

        <span className="text-xs text-zinc-500">
          {photoCount}/{MAX_PHOTOS} photos · {videoCount}/{MAX_VIDEOS} videos
        </span>
        {busy ? <span className="text-xs text-gold-bright">Uploading…</span> : null}
      </div>

      {media && media.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((m, i) => (
            <div key={m.id} className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/40">
              <div className="aspect-square w-full bg-black/40">
                {m.type === "PHOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                )}
                {m.type === "VIDEO" ? (
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {Math.round((m.durationMs ?? 0) / 1000)}s
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-1 border-t border-white/[0.06] px-2 py-1.5">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => void move(m.id, -1)}
                    className="rounded px-1.5 text-xs text-zinc-400 hover:text-gold-bright disabled:opacity-30"
                    aria-label="Move earlier"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={i === media.length - 1}
                    onClick={() => void move(m.id, 1)}
                    className="rounded px-1.5 text-xs text-zinc-400 hover:text-gold-bright disabled:opacity-30"
                    aria-label="Move later"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(m.id)}
                  className="rounded px-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          No pulls yet. Add a photo or a short video (≤20s) of a hit to show it off on your profile.
        </p>
      )}
    </div>
  );
}
