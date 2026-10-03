/**
 * Capture ~12s of live HLS into a local MP4/fMP4 or MPEG-TS file for Hit Clips.
 * Prefers fMP4 (EXT-X-MAP) which TikTok/iOS can share; falls back to .ts concat.
 */
import * as FileSystem from 'expo-file-system/legacy';

export const HIT_CLIP_CAPTURE_MS = 12_000;
const POLL_MS = 900;

type PlaylistSegment = {
  uri: string;
  durationSec: number;
};

function resolveUri(base: string, ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

function parseMediaPlaylist(text: string, playlistUrl: string): {
  initUri: string | null;
  segments: PlaylistSegment[];
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let initUri: string | null = null;
  const segments: PlaylistSegment[] = [];
  let nextDuration = 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-MAP:')) {
      const m = /URI="([^"]+)"/i.exec(line);
      if (m?.[1]) initUri = resolveUri(playlistUrl, m[1]);
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const n = Number(line.slice('#EXTINF:'.length).split(',')[0]);
      if (Number.isFinite(n) && n > 0) nextDuration = n;
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    segments.push({ uri: resolveUri(playlistUrl, line), durationSec: nextDuration });
    nextDuration = 2;
  }
  return { initUri, segments };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Playlist HTTP ${res.status}`);
  return res.text();
}

/** Follow master → first media playlist when needed. */
async function resolveMediaPlaylistUrl(playbackUrl: string): Promise<string> {
  const text = await fetchText(playbackUrl);
  if (text.includes('#EXTINF:') || text.includes('#EXT-X-MAP:')) return playbackUrl;

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const next = lines[i + 1];
      if (next && !next.startsWith('#')) return resolveUri(playbackUrl, next);
    }
  }
  // Fallback: first non-comment line that looks like a URI
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (line.includes('.m3u8') || line.startsWith('http')) return resolveUri(playbackUrl, line);
  }
  throw new Error('No HLS media playlist found');
}

async function downloadBinary(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Segment HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type CapturedHitClipFile = {
  uri: string;
  mime: string;
  durationMs: number;
  format: 'fmp4' | 'ts';
};

/**
 * Record forward from "now" for ~captureMs by polling the live HLS playlist.
 * Returns a local file URI ready to upload / share.
 */
export async function captureLiveHitClipFromHls(
  playbackUrl: string,
  opts?: { captureMs?: number; onProgress?: (elapsedMs: number) => void },
): Promise<CapturedHitClipFile> {
  const captureMs = opts?.captureMs ?? HIT_CLIP_CAPTURE_MS;
  const mediaUrl = await resolveMediaPlaylistUrl(playbackUrl.trim());
  const seen = new Set<string>();
  const orderedUris: string[] = [];
  let initUri: string | null = null;
  let durationSec = 0;
  const started = Date.now();

  while (Date.now() - started < captureMs) {
    opts?.onProgress?.(Date.now() - started);
    try {
      const text = await fetchText(mediaUrl);
      const parsed = parseMediaPlaylist(text, mediaUrl);
      if (parsed.initUri) initUri = parsed.initUri;
      for (const seg of parsed.segments) {
        if (seen.has(seg.uri)) continue;
        seen.add(seg.uri);
        orderedUris.push(seg.uri);
        durationSec += seg.durationSec;
      }
    } catch {
      /* keep polling — brief playlist blips are common */
    }
    await new Promise<void>((r) => setTimeout(r, POLL_MS));
  }
  opts?.onProgress?.(captureMs);

  if (orderedUris.length === 0) {
    throw new Error('No video segments captured. Wait for host video, then try Clip again.');
  }

  const parts: Uint8Array[] = [];
  if (initUri) {
    parts.push(await downloadBinary(initUri));
  }
  for (const uri of orderedUris) {
    parts.push(await downloadBinary(uri));
  }
  const bytes = concatBytes(parts);
  const format: 'fmp4' | 'ts' = initUri ? 'fmp4' : 'ts';
  const ext = format === 'fmp4' ? 'mp4' : 'ts';
  const mime = format === 'fmp4' ? 'video/mp4' : 'video/mp2t';
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No cache directory for clip file.');
  const uri = `${dir}hit-clip-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  const durationMs = Math.max(
    2_000,
    Math.min(15_000, Math.round((durationSec > 0 ? durationSec : captureMs / 1000) * 1000)),
  );

  return { uri, mime, durationMs, format };
}
