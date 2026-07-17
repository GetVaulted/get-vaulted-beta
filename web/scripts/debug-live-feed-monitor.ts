/**
 * Runtime monitor for live video blackouts (debug session dca6d1).
 * Polls production stream + HLS and appends NDJSON to workspace debug-dca6d1.log.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOM_ID = process.env.DEBUG_LIVE_ROOM_ID?.trim() || "cmro7z92d000r09l1esmf0lai";
const BASE = process.env.DEBUG_LIVE_BASE?.trim() || "https://shopgetvaulted.com";
const INTERVAL_MS = 4_000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.resolve(__dirname, "../../debug-dca6d1.log");

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const line = JSON.stringify({
    sessionId: "dca6d1",
    hypothesisId,
    location: "debug-live-feed-monitor.ts",
    message,
    data,
    timestamp: Date.now(),
  });
  appendFileSync(LOG_PATH, `${line}\n`, "utf8");
  console.log(line);
}

async function probeHls(url: string | null): Promise<{ ok: boolean; status: number | null; len: number | null }> {
  if (!url) return { ok: false, status: null, len: null };
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, len: text.length };
  } catch {
    return { ok: false, status: null, len: null };
  }
}

let prevStartedAt: string | null = null;
let prevHealth: string | null = null;
let prevHlsOk: boolean | null = null;

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/live-rooms/${encodeURIComponent(ROOM_ID)}/stream`, {
      cache: "no-store",
    });
    const body = (await res.json()) as {
      stream?: {
        streamHealth?: string;
        streamPaused?: boolean;
        streamMode?: string;
        stageAvailable?: boolean;
        streamStartedAt?: string | null;
        playbackUrl?: string | null;
      };
    };
    const s = body.stream;
    if (!s) {
      log("H3", "stream_missing", { http: res.status, roomId: ROOM_ID });
      return;
    }
    const hls = await probeHls(s.playbackUrl ?? null);
    const startedChanged = prevStartedAt != null && s.streamStartedAt !== prevStartedAt;
    const healthChanged = prevHealth != null && s.streamHealth !== prevHealth;
    const hlsFlipped = prevHlsOk != null && prevHlsOk !== hls.ok;

    log("H1_H2_H3", "prod_stream_tick", {
      roomId: ROOM_ID,
      streamHealth: s.streamHealth,
      streamPaused: s.streamPaused,
      streamMode: s.streamMode,
      stageAvailable: s.stageAvailable,
      streamStartedAt: s.streamStartedAt,
      hlsOk: hls.ok,
      hlsStatus: hls.status,
      hlsLen: hls.len,
      startedChanged,
      healthChanged,
      hlsFlipped,
    });

    if (startedChanged) log("H3", "stream_started_at_reset", { from: prevStartedAt, to: s.streamStartedAt });
    if (healthChanged) log("H5", "stream_health_changed", { from: prevHealth, to: s.streamHealth });
    if (hlsFlipped) log("H2", "hls_availability_flipped", { from: prevHlsOk, to: hls.ok, status: hls.status });

    prevStartedAt = s.streamStartedAt ?? null;
    prevHealth = s.streamHealth ?? null;
    prevHlsOk = hls.ok;
  } catch (e) {
    log("H2", "monitor_tick_error", { message: e instanceof Error ? e.message : String(e) });
  }
}

log("H1_H2_H3", "monitor_start", { roomId: ROOM_ID, base: BASE, intervalMs: INTERVAL_MS });
void tick();
setInterval(() => void tick(), INTERVAL_MS);
