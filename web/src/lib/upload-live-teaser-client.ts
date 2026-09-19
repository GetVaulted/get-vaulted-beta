import { LIVE_TEASER_MAX_DURATION_MS, LIVE_TEASER_MAX_BYTES } from "@/lib/live-room-teaser";

export async function readBrowserVideoDurationMs(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const durationSec = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const d = video.duration;
        if (!Number.isFinite(d) || d <= 0) {
          reject(new Error("Could not read video length."));
          return;
        }
        resolve(d);
      };
      video.onerror = () => reject(new Error("Could not read video."));
      video.src = objectUrl;
    });
    return Math.round(durationSec * 1000);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadLiveTeaserFile(file: File): Promise<{ url: string; durationMs: number }> {
  if (file.size > LIVE_TEASER_MAX_BYTES) {
    throw new Error("Teaser video must be 40MB or smaller.");
  }
  const durationMs = await readBrowserVideoDurationMs(file);
  if (durationMs > LIVE_TEASER_MAX_DURATION_MS) {
    throw new Error("Teaser video must be 15 seconds or shorter.");
  }
  if (durationMs < 1000) {
    throw new Error("Teaser video must be at least 1 second.");
  }

  const form = new FormData();
  form.append("file", file, file.name || "teaser.mp4");
  form.append("durationMs", String(durationMs));

  const res = await fetch("/api/uploads/live-teaser", { method: "POST", body: form });
  const body = (await res.json().catch(() => null)) as { url?: string; durationMs?: number; error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error?.trim() || "Could not upload teaser video.");
  }
  const url = body?.url?.trim();
  if (!url) throw new Error("Teaser upload did not return a URL.");
  return { url, durationMs: typeof body?.durationMs === "number" ? body.durationMs : durationMs };
}
