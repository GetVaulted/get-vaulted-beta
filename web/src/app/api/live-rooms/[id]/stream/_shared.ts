import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";
import { formatIvsObsIngestUrl } from "@/lib/ivs-obs-ingest-url";
import { isIvsWhipIngestEndpoint } from "@/lib/ivs-whip-ingest";

/** Configured IVS channel latency mode ("LOW" = low-latency HLS), without pulling in the AWS SDK service. */
function configuredLatencyMode(): "LOW" | "NORMAL" {
  const raw = process.env.AWS_IVS_LATENCY_MODE?.trim().toUpperCase();
  return raw === "NORMAL" ? "NORMAL" : "LOW";
}

export type StreamRow = {
  id: string;
  streamProvider: string;
  streamMode: string;
  streamHealth: string;
  streamPaused: boolean;
  ivsPlaybackUrl: string | null;
  ivsIngestEndpoint: string | null;
  ivsChannelArn: string | null;
  ivsChannelName: string | null;
  ivsStreamKeyArn: string | null;
  ivsStreamKeyCreatedAt: Date | null;
  ivsStageArn: string | null;
  streamStartedAt: Date | null;
  streamEndedAt: Date | null;
  lastIvsStatusSyncAt: Date | null;
  lastIvsError: string | null;
};

/**
 * Real-world data (Netlify logs, Sep 2026): this exact `LiveRoom` SELECT was observed taking
 * 219,921ms (~3m40s) during a live show, immediately followed by a `stream_status` realtime
 * broadcast to that same room failing with "subscribe timeout" — i.e. both the poll-based and
 * push-based paths a buyer/host relies on to know the video is healthy went dark at once. This
 * is the DB connection-pool contention already identified for push notifications
 * (`web/src/lib/prisma-pg-factory.ts` — no queue-wait timeout on the pool), landing on the one
 * query every live viewer's player polls every ~2.5s. node-postgres has no built-in cap on how
 * long a caller waits for a pool connection to free up, so a burst of concurrent load can leave
 * this hanging far longer than any client-side reconnect timeout (12s) — the client gives up
 * and the video reads as a black screen / stuck "Reconnecting" with no way to recover until this
 * one request eventually finishes. Racing it against a hard deadline turns an unbounded hang
 * into a fast, clear failure the client's existing poll loop (STREAM_POLL_MS = 2500ms) already
 * knows how to retry from — this doesn't fix the underlying pool contention, but it stops one
 * stuck query from stranding video status for minutes.
 */
const STREAM_ROW_QUERY_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function getStreamRow(liveRoomId: string): Promise<StreamRow | null> {
  return withTimeout(
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: {
        id: true,
        streamProvider: true,
        streamMode: true,
        streamHealth: true,
        streamPaused: true,
        ivsPlaybackUrl: true,
        ivsIngestEndpoint: true,
        ivsChannelArn: true,
        ivsChannelName: true,
        ivsStreamKeyArn: true,
        ivsStreamKeyCreatedAt: true,
        ivsStageArn: true,
        streamStartedAt: true,
        streamEndedAt: true,
        lastIvsStatusSyncAt: true,
        lastIvsError: true,
      },
    }),
    STREAM_ROW_QUERY_TIMEOUT_MS,
    "STREAM_ROW",
  );
}

export function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

export function toBuyerSafeStreamPayload(row: StreamRow) {
  return {
    roomId: row.id,
    streamProvider: row.streamProvider,
    // Delivery mode: `stage_webrtc` (sub-second WebRTC) vs `channel_hls` (HLS/OBS path).
    streamMode: row.streamMode,
    // Whether a Real-Time Stage exists for this room (gates the client's WebRTC subscribe attempt).
    // No ARN is exposed — buyers fetch a subscribe-only token from the stage-token endpoint.
    stageAvailable: Boolean(row.ivsStageArn),
    streamHealth: row.streamHealth,
    streamPaused: row.streamPaused,
    playbackUrl: row.ivsPlaybackUrl,
    streamStartedAt: toIso(row.streamStartedAt),
    streamEndedAt: toIso(row.streamEndedAt),
    lastStatusSyncAt: toIso(row.lastIvsStatusSyncAt),
    // Configured channel latency mode (LOW = low-latency HLS). Surfaced for client diagnostics.
    latencyMode: configuredLatencyMode(),
  };
}

export function toHostStreamPayload(row: StreamRow) {
  const whip = isIvsWhipIngestEndpoint(row.ivsIngestEndpoint);
  return {
    ...toBuyerSafeStreamPayload(row),
    // OBS Custom / WHIP: RTMPS URL for legacy, WHIP server for WebRTC OBS.
    ingestEndpoint: whip
      ? row.ivsIngestEndpoint
      : formatIvsObsIngestUrl(row.ivsIngestEndpoint),
    ingestProtocol: whip ? ("whip" as const) : row.streamMode === "channel_hls" ? ("rtmps" as const) : null,
    whipServerUrl: whip ? row.ivsIngestEndpoint : null,
    channelArn: row.ivsChannelArn,
    channelName: row.ivsChannelName,
    streamKeyArn: row.ivsStreamKeyArn,
    streamKeyCreatedAt: toIso(row.ivsStreamKeyCreatedAt),
    lastIvsError: row.lastIvsError,
  };
}

export async function requireHostAccess(liveRoomId: string, request: Request) {
  const auth = await requireLiveRoomHostAccess(liveRoomId, request);
  if (!auth.ok) return auth;
  return { ok: true as const, userId: auth.userId, access: auth.access };
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to process stream request.";
  // A getStreamRow() deadline firing (see withTimeout above) is a fast, expected failure under DB
  // contention, not a real error — surface it the same way as the route.ts GET handler does, so
  // every caller of getStreamRow behaves consistently and the client's own retry loop kicks in
  // quickly instead of treating this like an unexpected 500.
  if (message.endsWith("_TIMEOUT")) {
    return NextResponse.json(
      { error: "Stream status is temporarily unavailable. Retrying shortly." },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }
  const status = message.includes("not configured") ? 503 : 500;
  return NextResponse.json({ error: message }, { status });
}
