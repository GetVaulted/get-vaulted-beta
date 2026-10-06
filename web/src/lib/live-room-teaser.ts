/** Max teaser length (product: short clip). */
export const LIVE_TEASER_MAX_DURATION_MS = 15_000;
/** Soft floor so accidental 0-length uploads fail clearly. */
export const LIVE_TEASER_MIN_DURATION_MS = 1_000;
/** Upload size cap (~40MB). */
export const LIVE_TEASER_MAX_BYTES = 40 * 1024 * 1024;

export const LIVE_TEASER_ALLOWED_MIME = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
]);

export function mimeFromLiveTeaserFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return null;
}

/** ISO BMFF / QuickTime: `ftyp` box near the start. */
export function bufferLooksLikeMp4Family(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
  const head = buf.slice(0, Math.min(64, buf.length)).toString("ascii");
  return head.includes("ftyp");
}

export function normalizeTeaserVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim().slice(0, 2000);
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://")) return url;
  return null;
}

export function normalizeTeaserDurationMs(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function validateTeaserDurationMs(durationMs: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(durationMs) || durationMs < LIVE_TEASER_MIN_DURATION_MS) {
    return { ok: false, error: "Teaser video must be at least 1 second." };
  }
  if (durationMs > LIVE_TEASER_MAX_DURATION_MS) {
    return { ok: false, error: "Teaser video must be 15 seconds or shorter." };
  }
  return { ok: true };
}

export type LiveTeaserFields = {
  teaserVideoUrl: string | null;
  teaserVideoDurationMs: number | null;
};

/**
 * Parse create/PATCH teaser fields.
 * - Empty/null `teaserVideoUrl` clears both URL and duration.
 * - Setting a URL requires `teaserVideoDurationMs` in the same body.
 */
export function parseLiveTeaserFieldsFromBody(body: {
  teaserVideoUrl?: unknown;
  teaserVideoDurationMs?: unknown;
}): { ok: true; data: Partial<LiveTeaserFields> } | { ok: false; error: string } {
  if (!("teaserVideoUrl" in body)) return { ok: true, data: {} };

  const raw = body.teaserVideoUrl;
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: true, data: { teaserVideoUrl: null, teaserVideoDurationMs: null } };
  }

  const url = normalizeTeaserVideoUrl(raw);
  if (!url) return { ok: false, error: "Invalid teaser video URL." };

  const ms = normalizeTeaserDurationMs(body.teaserVideoDurationMs);
  if (ms == null) return { ok: false, error: "Teaser duration is required when setting a teaser video." };
  const check = validateTeaserDurationMs(ms);
  if (!check.ok) return check;

  return { ok: true, data: { teaserVideoUrl: url, teaserVideoDurationMs: ms } };
}
