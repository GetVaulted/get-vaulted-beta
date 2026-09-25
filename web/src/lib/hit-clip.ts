/** Hit Clip product limits — short vertical share for TikTok / Reels. */
export const HIT_CLIP_MAX_DURATION_MS = 15_000;
export const HIT_CLIP_MIN_DURATION_MS = 2_000;
export const HIT_CLIP_MAX_BYTES = 40 * 1024 * 1024;

export const HIT_CLIP_ALLOWED_MIME = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
]);

export function mimeFromHitClipFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return null;
}

export function bufferLooksLikeMp4Family(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
  const head = buf.slice(0, Math.min(64, buf.length)).toString("ascii");
  return head.includes("ftyp");
}

export function normalizeHitClipDurationMs(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function validateHitClipDurationMs(durationMs: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(durationMs) || durationMs < HIT_CLIP_MIN_DURATION_MS) {
    return { ok: false, error: "Hit clip must be at least 2 seconds." };
  }
  if (durationMs > HIT_CLIP_MAX_DURATION_MS) {
    return { ok: false, error: "Hit clip must be 15 seconds or shorter." };
  }
  return { ok: true };
}

export function canonicalHitClipShareUrl(clipId: string): string {
  const raw =
    process.env.NEXT_PUBLIC_CANONICAL_SHARE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SHARE_SITE_URL?.trim() ||
    "https://shopgetvaulted.com";
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  return `${withProto.replace(/\/$/, "")}/hit/${encodeURIComponent(clipId)}`;
}

export function buildHitClipShareCaption(args: {
  title: string;
  sellerUsername: string;
  shareUrl: string;
}): string {
  const handle = args.sellerUsername.replace(/^@/, "").trim() || "GetVaulted";
  const title = args.title.trim() || "Hit";
  return `HIT 🔥 ${title} from @${handle} on Get Vaulted\n${args.shareUrl}`;
}
