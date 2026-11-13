import { createHash } from "node:crypto";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";

/**
 * Second real-time live-video provider: Agora RTC for the seller's phone.
 *
 *   phone camera --(Agora RTC, real time)--> Agora channel
 *       --(Media Push, no transcode)--> Cloudflare Stream RTMPS input --> HLS --> buyers
 *
 * Buyers keep watching the same `playbackUrl` HLS as the other providers; only the seller's
 * sender changes. Env: AGORA_APP_ID, AGORA_APP_CERTIFICATE (token signing),
 * AGORA_REST_CUSTOMER_ID + AGORA_REST_CUSTOMER_SECRET (Media Push REST API), optional
 * AGORA_REST_REGION (na | eu | ap, default na).
 */

export type AgoraConfig = {
  appId: string;
  appCertificate: string;
  customerId: string;
  customerSecret: string;
  region: "na" | "eu" | "ap";
};

export function getAgoraConfig(env: NodeJS.ProcessEnv = process.env): AgoraConfig | null {
  const appId = env.AGORA_APP_ID?.trim() ?? "";
  const appCertificate = env.AGORA_APP_CERTIFICATE?.trim() ?? "";
  const customerId = env.AGORA_REST_CUSTOMER_ID?.trim() ?? "";
  const customerSecret = env.AGORA_REST_CUSTOMER_SECRET?.trim() ?? "";
  if (!appId || !appCertificate || !customerId || !customerSecret) return null;
  const r = env.AGORA_REST_REGION?.trim().toLowerCase();
  const region = r === "eu" || r === "ap" ? r : "na";
  return { appId, appCertificate, customerId, customerSecret, region };
}

export function isAgoraConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAgoraConfig(env) !== null;
}

function requireConfig(): AgoraConfig {
  const cfg = getAgoraConfig();
  if (!cfg) {
    throw new Error(
      "Agora live video is not configured. Set AGORA_APP_ID, AGORA_APP_CERTIFICATE, AGORA_REST_CUSTOMER_ID and AGORA_REST_CUSTOMER_SECRET.",
    );
  }
  return cfg;
}

/** One Agora channel per live room. */
export function agoraChannelName(roomId: string): string {
  return `gv-${roomId}`.slice(0, 63);
}

/** Stable numeric uid (1..2^32-1) for a room's host, so a rejoin keeps the same stream uid. */
export function agoraHostUid(roomId: string): number {
  const digest = createHash("sha256").update(`gv-host:${roomId}`).digest();
  const n = digest.readUInt32BE(0);
  return n === 0 ? 1 : n;
}

/** Host token lifetime. Agora caps a token at 24 h; the app refreshes before it lapses. */
export const AGORA_HOST_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export type AgoraHostSession = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  expiresInSeconds: number;
};

export function createAgoraHostSession(roomId: string): AgoraHostSession {
  const cfg = requireConfig();
  const channel = agoraChannelName(roomId);
  const uid = agoraHostUid(roomId);
  const ttl = AGORA_HOST_TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithUid(cfg.appId, cfg.appCertificate, channel, uid, RtcRole.PUBLISHER, ttl, ttl);
  return { appId: cfg.appId, channel, uid, token, expiresInSeconds: ttl };
}

// --- Media Push (RTMP relay) -------------------------------------------------------------------

type ConverterState = "connecting" | "running" | "failed" | string;

export type AgoraRelay = { converterId: string; state: ConverterState };

function restBase(cfg: AgoraConfig): string {
  return `https://api.agora.io/${cfg.region}/v1/projects/${encodeURIComponent(cfg.appId)}/rtmp-converters`;
}

function authHeader(cfg: AgoraConfig): string {
  return `Basic ${Buffer.from(`${cfg.customerId}:${cfg.customerSecret}`).toString("base64")}`;
}

async function agoraRest<T>(cfg: AgoraConfig, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(cfg),
      "X-Request-ID": crypto.randomUUID(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const message = typeof json.message === "string" && json.message ? json.message : `HTTP ${res.status}`;
    const err = new Error(`Agora Media Push request failed: ${message}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

/** Joins an RTMPS base URL and a stream key the way Cloudflare expects (single slash). */
export function joinRtmpUrl(base: string, streamKey: string): string {
  return `${base.replace(/\/+$/, "")}/${streamKey.replace(/^\/+/, "")}`;
}

/**
 * Start pushing the host's raw (untranscoded) camera stream from the Agora channel to an RTMP(S)
 * URL. Untranscoded single-host push is the cheapest Media Push tier. The phone publishes H.264.
 * `idleTimeOut` lets a short drop (host backgrounds, network blip) recover without a new converter.
 */
export async function startAgoraRelay(args: { roomId: string; rtmpUrl: string }): Promise<AgoraRelay> {
  const cfg = requireConfig();
  const name = `gv-${args.roomId}-${Date.now().toString(36)}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  const json = await agoraRest<{ converter?: { id?: string; state?: string } }>(cfg, "POST", restBase(cfg), {
    converter: {
      name,
      rawOptions: {
        rtcChannel: agoraChannelName(args.roomId),
        rtcStreamUid: agoraHostUid(args.roomId),
      },
      rtmpUrl: args.rtmpUrl,
      idleTimeOut: 300,
    },
  });
  const id = json.converter?.id;
  if (!id) throw new Error("Agora Media Push did not return a converter id.");
  logIvsOpsServer("agora_relay_started", { roomId: args.roomId, state: json.converter?.state ?? "unknown" });
  return { converterId: id, state: json.converter?.state ?? "connecting" };
}

/** Current state of a converter, or null when Agora no longer knows it (idle-timed-out / deleted). */
export async function getAgoraRelay(converterId: string): Promise<AgoraRelay | null> {
  const cfg = requireConfig();
  try {
    const json = await agoraRest<{ state?: string; converter?: { state?: string } }>(
      cfg,
      "GET",
      `${restBase(cfg)}/${encodeURIComponent(converterId)}`,
    );
    return { converterId, state: json.state ?? json.converter?.state ?? "unknown" };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return null;
    throw e;
  }
}

/** Stop a converter. Best effort; never throws (an already-gone converter is fine). */
export async function stopAgoraRelay(converterId: string | null | undefined): Promise<void> {
  if (!converterId) return;
  const cfg = getAgoraConfig();
  if (!cfg) return;
  try {
    await agoraRest(cfg, "DELETE", `${restBase(cfg)}/${encodeURIComponent(converterId)}`);
    logIvsOpsServer("agora_relay_stopped", {});
  } catch {
    logIvsOpsServer("agora_relay_stop_failed", {});
  }
}
