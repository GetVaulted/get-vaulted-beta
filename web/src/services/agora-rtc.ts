import { createHash } from "node:crypto";
import { RtcRole, RtcTokenBuilder } from "agora-token";

/**
 * Second real-time live-video provider: Agora RTC, direct.
 *
 *   seller phone --(publish)--> Agora channel --(subscribe)--> buyers (app + web)
 *
 * One vendor does both jobs, like AWS IVS Real-Time: no relay, no HLS in the middle. The seller joins
 * a per-room channel as the host (publisher token); buyers and guests join the same channel as
 * audience (subscribe-only token). Env: AGORA_APP_ID and AGORA_APP_CERTIFICATE (token signing).
 */

export type AgoraConfig = {
  appId: string;
  appCertificate: string;
};

export function getAgoraConfig(env: NodeJS.ProcessEnv = process.env): AgoraConfig | null {
  const appId = env.AGORA_APP_ID?.trim() ?? "";
  const appCertificate = env.AGORA_APP_CERTIFICATE?.trim() ?? "";
  if (!appId || !appCertificate) return null;
  return { appId, appCertificate };
}

export function isAgoraConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAgoraConfig(env) !== null;
}

function requireConfig(): AgoraConfig {
  const cfg = getAgoraConfig();
  if (!cfg) {
    throw new Error("Agora live video is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE.");
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

/** Viewer token lifetime. Short: the player asks for a fresh one before it lapses or on a rejoin. */
export const AGORA_VIEWER_TOKEN_TTL_SECONDS = 2 * 60 * 60;

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

export type AgoraViewerSession = {
  appId: string;
  channel: string;
  /** Uid of the host's published stream, so the player can pick the right remote user. */
  hostUid: number;
  /** Uid the viewer joins with. 0 = let Agora assign one (the token is valid for any uid). */
  uid: number;
  token: string;
  expiresInSeconds: number;
};

/** Subscribe-only pass for one room's channel. Cannot publish. */
export function createAgoraViewerSession(roomId: string): AgoraViewerSession {
  const cfg = requireConfig();
  const channel = agoraChannelName(roomId);
  const ttl = AGORA_VIEWER_TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithUid(cfg.appId, cfg.appCertificate, channel, 0, RtcRole.SUBSCRIBER, ttl, ttl);
  return { appId: cfg.appId, channel, hostUid: agoraHostUid(roomId), uid: 0, token, expiresInSeconds: ttl };
}
