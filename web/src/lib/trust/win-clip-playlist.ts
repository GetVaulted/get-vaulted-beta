import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for "Watch your win" video receipts: cut a short clip out of an IVS recording
 * by wall-clock time. IVS HLS playlists carry `#EXT-X-PROGRAM-DATE-TIME` per segment, so a
 * purchase timestamp maps directly onto segments -- no re-encoding needed.
 */

export const WIN_CLIP_PRE_SECONDS = 40;
export const WIN_CLIP_POST_SECONDS = 25;

export type HlsSegment = {
  /** Segment file name relative to the playlist (e.g. `123.ts`). */
  uri: string;
  startMs: number;
  durationSec: number;
};

/** Parse an IVS recording media playlist into timed segments. Segments without a date are skipped. */
export function parseMediaPlaylist(text: string): HlsSegment[] {
  const out: HlsSegment[] = [];
  let pendingDate: number | null = null;
  let pendingDuration: number | null = null;
  let lastEndMs: number | null = null as number | null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      const ms = Date.parse(line.slice("#EXT-X-PROGRAM-DATE-TIME:".length));
      pendingDate = Number.isFinite(ms) ? ms : null;
    } else if (line.startsWith("#EXTINF:")) {
      const n = Number.parseFloat(line.slice("#EXTINF:".length).split(",")[0] ?? "");
      pendingDuration = Number.isFinite(n) ? n : null;
    } else if (!line.startsWith("#")) {
      if (pendingDuration != null) {
        const startMs: number | null = pendingDate ?? lastEndMs;
        if (startMs != null) {
          out.push({ uri: line, startMs, durationSec: pendingDuration });
          lastEndMs = startMs + pendingDuration * 1000;
        }
      }
      pendingDate = null;
      pendingDuration = null;
    }
  }
  return out;
}

export type ClipSelection = {
  segments: HlsSegment[];
  /** Seconds into the first selected segment where the moment window actually begins. */
  clipStartMs: number;
  clipEndMs: number;
  /** Where the purchase moment falls inside the clip (seconds from clip start). */
  momentOffsetSec: number;
  durationSec: number;
};

/**
 * Pick the segments covering `[momentMs - pre, momentMs + post]`. Returns null when the moment is
 * not inside the recording (before it began or after it ended).
 */
export function selectClipSegments(
  segments: HlsSegment[],
  momentMs: number,
  opts?: { preSeconds?: number; postSeconds?: number },
): ClipSelection | null {
  if (segments.length === 0) return null;
  const pre = (opts?.preSeconds ?? WIN_CLIP_PRE_SECONDS) * 1000;
  const post = (opts?.postSeconds ?? WIN_CLIP_POST_SECONDS) * 1000;
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const recStart = first.startMs;
  const recEnd = last.startMs + last.durationSec * 1000;
  if (momentMs < recStart || momentMs > recEnd) return null;

  const from = Math.max(recStart, momentMs - pre);
  const to = Math.min(recEnd, momentMs + post);
  const picked = segments.filter((s) => {
    const end = s.startMs + s.durationSec * 1000;
    return end > from && s.startMs < to;
  });
  if (picked.length === 0) return null;
  const clipStartMs = picked[0]!.startMs;
  const lastPicked = picked[picked.length - 1]!;
  const clipEndMs = lastPicked.startMs + lastPicked.durationSec * 1000;
  return {
    segments: picked,
    clipStartMs,
    clipEndMs,
    momentOffsetSec: Math.max(0, (momentMs - clipStartMs) / 1000),
    durationSec: (clipEndMs - clipStartMs) / 1000,
  };
}

/** Build a VOD media playlist whose segment URIs are already absolute (pre-signed). */
export function buildClipPlaylist(segments: HlsSegment[], resolveUri: (segmentUri: string) => string): string {
  const target = Math.max(1, Math.ceil(Math.max(...segments.map((s) => s.durationSec))));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${target}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (const s of segments) {
    lines.push(`#EXTINF:${s.durationSec.toFixed(3)},`);
    lines.push(resolveUri(s.uri));
  }
  lines.push("#EXT-X-ENDLIST");
  return `${lines.join("\n")}\n`;
}

/** Recording folders are `YYYY/M/D/H/m` in UTC with no zero padding. */
export function recordingDayPrefixes(channelBase: string, momentMs: number, lookbackDays = 2): string[] {
  const base = channelBase.replace(/\/+$/, "");
  const out: string[] = [];
  for (let i = 0; i <= lookbackDays; i += 1) {
    const d = new Date(momentMs - i * 86_400_000);
    out.push(`${base}/${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}/`);
  }
  return out;
}

/** `arn:aws:ivs:us-east-1:123456789012:channel/AbCd` -> `ivs/v1/123456789012/AbCd` */
export function channelS3Base(channelArn: string): string | null {
  const m = /^arn:aws:ivs:[^:]+:(\d+):channel\/([A-Za-z0-9]+)$/.exec(channelArn.trim());
  if (!m) return null;
  return `ivs/v1/${m[1]}/${m[2]}`;
}

export type WinClipKind = "spot" | "order";

export type WinClipTokenPayload = { k: WinClipKind; id: string; u: string; exp: number };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signWinClipToken(payload: WinClipTokenPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyWinClipToken(token: string, secret: string, nowMs = Date.now()): WinClipTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as WinClipTokenPayload;
    if (!parsed || (parsed.k !== "spot" && parsed.k !== "order") || !parsed.id || !parsed.u) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}
