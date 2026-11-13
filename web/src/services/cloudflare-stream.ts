import type { LiveStreamHealth } from "@/generated/prisma/client";
import { getBoolAdminSetting } from "@/lib/admin/admin-settings";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";

/**
 * Backup live-video provider: Cloudflare Stream live inputs.
 * Seller pushes RTMPS (OBS / Larix / any RTMP app) -> Cloudflare -> HLS that the existing buyer
 * players already play (same `playbackUrl` contract as the IVS channel_hls path).
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN (Stream:Edit), CLOUDFLARE_STREAM_CUSTOMER_CODE
 * (the "customer-<CODE>" subdomain shown in the Stream dashboard). Optional CLOUDFLARE_STREAM_LOW_LATENCY=1.
 */

export type CloudflareStreamConfig = {
  accountId: string;
  apiToken: string;
  customerCode: string;
  lowLatency: boolean;
};

export function getCloudflareStreamConfig(env: NodeJS.ProcessEnv = process.env): CloudflareStreamConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const apiToken = env.CLOUDFLARE_STREAM_API_TOKEN?.trim() ?? "";
  const rawCode = env.CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim() ?? "";
  const customerCode = rawCode.replace(/^customer-/i, "").replace(/\.cloudflarestream\.com.*$/i, "");
  if (!accountId || !apiToken || !customerCode) return null;
  const ll = env.CLOUDFLARE_STREAM_LOW_LATENCY?.trim().toLowerCase();
  return { accountId, apiToken, customerCode, lowLatency: ll === "1" || ll === "true" };
}

export function isCloudflareStreamConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getCloudflareStreamConfig(env) !== null;
}

function requireConfig(): CloudflareStreamConfig {
  const cfg = getCloudflareStreamConfig();
  if (!cfg) {
    throw new Error(
      "Backup live video is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN and CLOUDFLARE_STREAM_CUSTOMER_CODE.",
    );
  }
  return cfg;
}

/** Admin switch (Settings -> "Use backup live video"). Off by default. */
export async function isBackupLiveVideoActive(): Promise<boolean> {
  return getBoolAdminSetting("live_video_use_cloudflare");
}

export function cloudflareHlsPlaybackUrl(customerCode: string, inputUid: string): string {
  return `https://customer-${customerCode}.cloudflarestream.com/${inputUid}/manifest/video.m3u8`;
}

export type CloudflareLiveInput = {
  uid: string;
  rtmpsUrl: string;
  streamKey: string;
  playbackUrl: string;
};

type CfEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ message?: string }> };

async function cfApi<T>(cfg: CloudflareStreamConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
  if (!res.ok || json.success === false) {
    const msg = json.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare Stream request failed: ${msg}`);
  }
  return json.result as T;
}

type RawLiveInput = { uid: string; rtmps?: { url?: string; streamKey?: string } };

function toLiveInput(cfg: CloudflareStreamConfig, raw: RawLiveInput): CloudflareLiveInput {
  const url = raw.rtmps?.url?.trim();
  const key = raw.rtmps?.streamKey?.trim();
  if (!raw.uid || !url || !key) throw new Error("Cloudflare Stream returned an incomplete live input.");
  return { uid: raw.uid, rtmpsUrl: url, streamKey: key, playbackUrl: cloudflareHlsPlaybackUrl(cfg.customerCode, raw.uid) };
}

/**
 * Create a live input for a room. Recording must be `automatic`: Cloudflare only serves HLS for
 * inputs that record (the recording is deleted when the show ends — see deleteCloudflareLiveInput).
 */
export async function createCloudflareLiveInput(roomId: string): Promise<CloudflareLiveInput> {
  const cfg = requireConfig();
  const raw = await cfApi<RawLiveInput>(cfg, "POST", "/stream/live_inputs", {
    meta: { name: `vaulted-live-${roomId}` },
    recording: { mode: "automatic" },
    ...(cfg.lowLatency ? { preferLowLatency: true } : {}),
  });
  return toLiveInput(cfg, raw);
}

export async function getCloudflareLiveInput(uid: string): Promise<CloudflareLiveInput> {
  const cfg = requireConfig();
  return toLiveInput(cfg, await cfApi<RawLiveInput>(cfg, "GET", `/stream/live_inputs/${encodeURIComponent(uid)}`));
}

/** Delete the input and any recording it produced. Best effort; never throws. */
export async function deleteCloudflareLiveInput(uid: string): Promise<void> {
  const cfg = getCloudflareStreamConfig();
  if (!cfg || !uid) return;
  try {
    const videos = await cfApi<Array<{ uid?: string }>>(
      cfg,
      "GET",
      `/stream/live_inputs/${encodeURIComponent(uid)}/videos`,
    ).catch(() => []);
    for (const v of videos ?? []) {
      if (v?.uid) await cfApi(cfg, "DELETE", `/stream/${encodeURIComponent(v.uid)}`).catch(() => {});
    }
    await cfApi(cfg, "DELETE", `/stream/live_inputs/${encodeURIComponent(uid)}`);
    logIvsOpsServer("cloudflare_live_input_deleted", { videoCount: videos?.length ?? 0 });
  } catch {
    logIvsOpsServer("cloudflare_live_input_delete_failed", {});
  }
}

export type CloudflareStatusResult = { probeFailed: true } | { probeFailed: false; health: LiveStreamHealth };

/** Public lifecycle endpoint: `{ isInput, videoUID, live }`. */
export async function getCloudflareStreamStatus(uid: string): Promise<CloudflareStatusResult> {
  const cfg = getCloudflareStreamConfig();
  if (!cfg) return { probeFailed: true };
  try {
    const res = await fetch(`https://customer-${cfg.customerCode}.cloudflarestream.com/${encodeURIComponent(uid)}/lifecycle`, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
      cache: "no-store",
    });
    if (!res.ok) return { probeFailed: true };
    const j = (await res.json().catch(() => null)) as { live?: unknown } | null;
    if (!j || typeof j.live !== "boolean") return { probeFailed: true };
    return { probeFailed: false, health: j.live ? "live" : "offline" };
  } catch {
    return { probeFailed: true };
  }
}
