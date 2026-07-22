import {
  CreateChannelCommand,
  CreateStreamKeyCommand,
  DeleteStreamKeyCommand,
  GetChannelCommand,
  GetStreamCommand,
  StopStreamCommand,
  UpdateChannelCommand,
  IvsClient,
  type ChannelLatencyMode,
  type ChannelType,
  type StreamState,
} from "@aws-sdk/client-ivs";
import {
  CreateParticipantTokenCommand,
  CreateStageCommand,
  DeleteStageCommand,
  GetCompositionCommand,
  IVSRealTimeClient,
  ListParticipantsCommand,
  ListStageSessionsCommand,
  ParticipantTokenCapability,
  StartCompositionCommand,
  StopCompositionCommand,
} from "@aws-sdk/client-ivs-realtime";
import { decideCompositionHealAction } from "@/lib/live-composition-heal";
import type { LiveStreamHealth } from "@/generated/prisma/client";
import { logIvsOpsServer, type IvsStreamHealthOpSource } from "@/lib/ivs-ops-log";
import { prisma } from "@/lib/prisma";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";

type RequiredIvsEnv = {
  region: string;
  channelType: ChannelType;
  latencyMode: ChannelLatencyMode;
  accessKeyId: string;
  secretAccessKey: string;
};

export type IvsProvisionResult = {
  roomId: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKeyValue: string;
  streamKeyArn: string;
  channelArn: string;
  channelName: string;
  streamHealth: LiveStreamHealth;
};

function toRoomHealth(state: StreamState | string | null | undefined): LiveStreamHealth {
  switch ((state ?? "").toUpperCase()) {
    case "LIVE":
      return "live";
    case "OFFLINE":
      return "offline";
    case "CONNECTING":
      return "connecting";
    case "ENDED":
      return "ended";
    default:
      return "error";
  }
}

function getEnv(): RequiredIvsEnv {
  const region =
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "";
  const accessKeyId =
    process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS IVS is not configured. Set VAULTED_AWS_REGION (or AWS_REGION), VAULTED_AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID), and VAULTED_AWS_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY).",
    );
  }

  const rawChannelType = (process.env.AWS_IVS_CHANNEL_TYPE?.trim() ?? "STANDARD").toUpperCase();
  const channelType: ChannelType = rawChannelType === "BASIC" ? "BASIC" : "STANDARD";

  const rawLatencyMode = (process.env.AWS_IVS_LATENCY_MODE?.trim() ?? "LOW").toUpperCase();
  const latencyMode: ChannelLatencyMode = rawLatencyMode === "NORMAL" ? "NORMAL" : "LOW";

  return { region, channelType, latencyMode, accessKeyId, secretAccessKey };
}

function makeClient() {
  const env = getEnv();
  return new IvsClient({
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

function createChannelName(roomId: string): string {
  const sanitized = roomId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 40);
  return `vaulted-live-${sanitized}-${Date.now()}`;
}

/** IVS Recording configuration ARN for auto-VOD to S3 (optional in local/dev). */
export function getIvsRecordingConfigurationArn(): string | null {
  const arn = process.env.AWS_IVS_RECORDING_CONFIGURATION_ARN?.trim() || "";
  return arn || null;
}

/**
 * Attach the env Recording configuration to an existing channel when missing.
 * Safe no-op when ARN unset or channel already points at the same config.
 */
export async function ensureChannelRecordingConfiguration(channelArn: string): Promise<boolean> {
  const recordingConfigurationArn = getIvsRecordingConfigurationArn();
  if (!recordingConfigurationArn) return false;

  const client = makeClient();
  try {
    const current = await client.send(new GetChannelCommand({ arn: channelArn }));
    const existing = current.channel?.recordingConfigurationArn?.trim() || "";
    if (existing === recordingConfigurationArn) return false;

    await client.send(
      new UpdateChannelCommand({
        arn: channelArn,
        recordingConfigurationArn,
      }),
    );
    logIvsOpsServer("ivs_channel_recording_attached", {
      channelArnLen: channelArn.length,
      hadPriorConfig: Boolean(existing),
    });
    return true;
  } catch (e) {
    logIvsOpsServer("ivs_channel_recording_attach_failed", {
      channelArnLen: channelArn.length,
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    });
    return false;
  }
}

export async function createChannel(roomId: string) {
  const env = getEnv();
  const client = makeClient();
  const inputName = createChannelName(roomId);
  const recordingConfigurationArn = getIvsRecordingConfigurationArn();
  const out = await client.send(
    new CreateChannelCommand({
      name: inputName,
      type: env.channelType,
      latencyMode: env.latencyMode,
      ...(recordingConfigurationArn ? { recordingConfigurationArn } : {}),
      tags: {
        app: "vaulted-live",
        roomId,
      },
    }),
  );
  if (!out.channel?.arn || !out.channel?.playbackUrl || !out.channel?.ingestEndpoint || !out.channel?.name) {
    throw new Error("IVS channel provisioning failed. Missing channel details from AWS.");
  }
  if (!out.streamKey?.arn || !out.streamKey?.value) {
    throw new Error("IVS channel provisioning failed. CreateChannel did not return an initial stream key.");
  }
  logIvsOpsServer("ivs_channel_created", {
    roomId,
    channelType: env.channelType,
    configuredLatencyMode: env.latencyMode,
    // Actual mode echoed back by AWS on the freshly created channel — confirms LOW vs NORMAL.
    actualLatencyMode: out.channel.latencyMode ?? "unknown",
    recordingConfigured: Boolean(recordingConfigurationArn),
  });
  return {
    arn: out.channel.arn,
    playbackUrl: out.channel.playbackUrl,
    ingestEndpoint: out.channel.ingestEndpoint,
    name: out.channel.name,
    streamKeyArn: out.streamKey.arn,
    streamKeyValue: out.streamKey.value,
  };
}

export async function createStreamKey(channelArn: string) {
  const client = makeClient();
  const out = await client.send(new CreateStreamKeyCommand({ channelArn }));
  if (!out.streamKey?.arn || !out.streamKey?.value) {
    throw new Error("IVS stream key creation failed.");
  }
  return {
    arn: out.streamKey.arn,
    value: out.streamKey.value,
  };
}

/**
 * Fetch the channel's **actual** latency mode from AWS (diagnostic).
 * Confirms whether an existing/older channel is LOW vs NORMAL regardless of current env config.
 */
export async function getIvsChannelLatencyMode(channelArn: string): Promise<string | null> {
  try {
    const client = makeClient();
    const out = await client.send(new GetChannelCommand({ arn: channelArn }));
    return out.channel?.latencyMode ?? null;
  } catch {
    return null;
  }
}

export async function getStreamStatus(channelArn: string) {
  try {
    const client = makeClient();
    const out = await client.send(new GetStreamCommand({ channelArn }));
    const state = out.stream?.state ?? "OFFLINE";
    return {
      state,
      health: mapIvsStatusToRoomHealth(state),
    };
  } catch {
    /** Channel not broadcasting / no active stream — treat as offline (do not log ARNs). */
    return { state: "OFFLINE", health: "offline" as LiveStreamHealth };
  }
}

export function mapIvsStatusToRoomHealth(state: StreamState | string | null | undefined): LiveStreamHealth {
  return toRoomHealth(state);
}

/** Normalize EventBridge / internal webhook state strings to IVS-style tokens for `mapIvsStatusToRoomHealth`. */
export function normalizeExternalIvsStateToken(raw: string | null | undefined): string {
  const s = (raw ?? "OFFLINE").trim().toUpperCase().replace(/-/g, "_");
  if (s === "LIVE" || s === "STREAM_LIVE" || s === "ACTIVE" || s === "BROADCASTING") return "LIVE";
  if (s === "CONNECTING" || s === "STARTING" || s === "PENDING") return "CONNECTING";
  if (s === "ENDED" || s === "STOPPED") return "ENDED";
  if (s === "OFFLINE" || s === "IDLE") return "OFFLINE";
  if (s.includes("ERROR") || s === "FAILED") return "UNKNOWN";
  return s.length ? s : "OFFLINE";
}

type StreamHealthCommitResult =
  | { kind: "unchanged_health"; newHealth: LiveStreamHealth; roomVersion: number }
  | { kind: "updated"; previousHealth: LiveStreamHealth; newHealth: LiveStreamHealth; roomVersion: number };

/**
 * Persists IVS-derived stream health, bumps `roomVersion` when health changes, emits buyer-safe realtime.
 * Does **not** change `LiveRoom.status` (auction / go-live remain app-driven).
 */
/**
 * Grace window after a stage Go Live during which the still-warming HLS channel must not downgrade
 * stream health. Covers the ~1s gap where the stream publishes (streamHealth=live) before the room
 * status flips to "live", plus the ~6s before the HLS mirror composition starts. Without this, a
 * buyer stream poll in that window reads the empty channel as offline, marks the fresh stage
 * offline + stamps streamEndedAt, buyers go black, and the deferred mirror never starts — forcing
 * the host to leave and re-enter to recover.
 */
const STAGE_GOLIVE_HEALTH_GRACE_MS = 90_000;

/** Stage WebRTC rides the Real-Time Stage — IVS channel polls must not downgrade live buyers to offline. */
export async function ignoreChannelHealthDowngradeForActiveStage(args: {
  liveRoomId: string;
  newHealth: LiveStreamHealth;
}): Promise<boolean> {
  const downgrading =
    args.newHealth === "offline" || args.newHealth === "ended" || args.newHealth === "error";
  if (!downgrading) return false;

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: {
      status: true,
      streamMode: true,
      ivsStageArn: true,
      streamStartedAt: true,
    },
  });
  if (!room || room.streamMode !== "stage_webrtc" || !room.ivsStageArn) {
    return false;
  }

  // The Real-Time Stage (WebRTC) is the source of truth for stage rooms; the HLS channel mirror
  // legitimately lags Go Live by several seconds and is absent during host reconnects. While the
  // room is live, an empty channel must never mark the stage offline — health is driven by
  // Go Live / End Show + soft-disconnect, not the channel poll.
  if (room.status === "live") return true;

  // Go-Live transition: the stream publishes (streamHealth=live) ~1s before room.status flips to
  // "live", so a buyer poll in that sliver would otherwise mark the fresh stage offline.
  const startedMs = room.streamStartedAt?.getTime() ?? 0;
  return startedMs > 0 && Date.now() - startedMs < STAGE_GOLIVE_HEALTH_GRACE_MS;
}

export async function commitLiveRoomStreamHealthFromIvs(args: {
  liveRoomId: string;
  newHealth: LiveStreamHealth;
  opSource?: IvsStreamHealthOpSource;
}): Promise<StreamHealthCommitResult> {
  const { liveRoomId, newHealth, opSource } = args;
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      streamHealth: true,
      roomVersion: true,
      streamStartedAt: true,
    },
  });
  if (!room) {
    throw new Error("Live room not found.");
  }

  if (await ignoreChannelHealthDowngradeForActiveStage({ liveRoomId, newHealth })) {
    logIvsOpsServer("ivs_stream_health_ignored_stage_webrtc", {
      roomId: liveRoomId,
      attemptedHealth: newHealth,
      opSource: typeof opSource === "string" ? opSource : "unknown",
    });
    return { kind: "unchanged_health", newHealth: room.streamHealth, roomVersion: room.roomVersion };
  }

  const now = new Date();
  const previousHealth = room.streamHealth;

  if (previousHealth === newHealth) {
    await prisma.liveRoom.update({
      where: { id: liveRoomId },
      data: { lastIvsStatusSyncAt: now, lastIvsError: null },
    });
    return { kind: "unchanged_health", newHealth, roomVersion: room.roomVersion };
  }

  const data: {
    streamHealth: LiveStreamHealth;
    lastIvsStatusSyncAt: Date;
    lastIvsError: null;
    roomVersion: { increment: number };
    streamStartedAt?: Date;
    streamEndedAt?: Date | null;
  } = {
    streamHealth: newHealth,
    lastIvsStatusSyncAt: now,
    lastIvsError: null,
    roomVersion: { increment: 1 },
  };

  if (newHealth === "live") {
    if (!room.streamStartedAt) {
      data.streamStartedAt = now;
    }
    data.streamEndedAt = null;
  }
  if ((newHealth === "offline" || newHealth === "ended" || newHealth === "error") && previousHealth === "live") {
    data.streamEndedAt = now;
  }

  const updated = await prisma.liveRoom.update({
    where: { id: liveRoomId },
    data,
    select: { roomVersion: true },
  });

  emitStreamStatusChanged(liveRoomId, {
    streamHealth: newHealth,
    roomVersion: updated.roomVersion,
    lastStatusSyncAt: now.toISOString(),
  });

  logIvsOpsServer("ivs_stream_health_transition", {
    roomId: liveRoomId,
    from: previousHealth,
    to: newHealth,
    roomVersion: updated.roomVersion,
    opSource: typeof opSource === "string" ? opSource : "unknown",
  });

  return {
    kind: "updated",
    previousHealth,
    newHealth,
    roomVersion: updated.roomVersion,
  };
}

/**
 * Poll IVS `GetStream` and reconcile `LiveRoom.streamHealth` (+ timestamps). Keeps `room.status` unchanged.
 */
export async function syncLiveRoomStreamFromIvs(liveRoomId: string): Promise<StreamHealthCommitResult | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      status: true,
      streamProvider: true,
      ivsChannelArn: true,
      streamHealth: true,
    },
  });
  if (!room || room.streamProvider !== "aws_ivs" || !room.ivsChannelArn) {
    return null;
  }

  const { health } = await getStreamStatus(room.ivsChannelArn);
  // Diagnostic: confirm the channel's *actual* latency mode from AWS (not just env), to catch
  // older rooms whose channel was provisioned before LOW-latency config.
  const actualLatencyMode = await getIvsChannelLatencyMode(room.ivsChannelArn);
  logIvsOpsServer("ivs_channel_latency_mode", {
    roomId: liveRoomId,
    actualLatencyMode: actualLatencyMode ?? "unknown",
    configuredLatencyMode: getEnv().latencyMode,
  });
  return commitLiveRoomStreamHealthFromIvs({ liveRoomId, newHealth: health, opSource: "sync_get_stream" });
}

/**
 * Apply a trusted stream state (e.g. EventBridge) without calling IVS again.
 */
export async function applyRecordedIvsStreamState(liveRoomId: string, ivsStateToken: string): Promise<StreamHealthCommitResult | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { streamProvider: true },
  });
  if (!room || room.streamProvider !== "aws_ivs") return null;
  const normalized = normalizeExternalIvsStateToken(ivsStateToken);
  const health = mapIvsStatusToRoomHealth(normalized);
  return commitLiveRoomStreamHealthFromIvs({ liveRoomId, newHealth: health, opSource: "recorded_state" });
}

export async function findLiveRoomIdByIvsChannelArn(channelArn: string): Promise<string | null> {
  const row = await prisma.liveRoom.findFirst({
    where: { ivsChannelArn: channelArn },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * When the app room is **live** but IVS reports no broadcast, align `streamHealth` to offline/ended without ending the room.
 * Call from cron or after sync; uses same commit path as IVS poll.
 */
export async function reconcileStaleLiveStreamWithRoomStatus(liveRoomId: string): Promise<StreamHealthCommitResult | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { status: true, streamHealth: true, streamProvider: true, ivsChannelArn: true },
  });
  if (!room || room.status !== "live" || room.streamProvider !== "aws_ivs" || !room.ivsChannelArn) {
    return null;
  }
  const { health } = await getStreamStatus(room.ivsChannelArn);
  const ivsDown = health === "offline" || health === "ended";
  const wasExpectingSignal =
    room.streamHealth === "live" ||
    room.streamHealth === "connecting" ||
    (room.streamHealth === "error" && ivsDown);

  if (wasExpectingSignal && ivsDown) {
    return commitLiveRoomStreamHealthFromIvs({ liveRoomId, newHealth: health, opSource: "stale_reconcile" });
  }
  return null;
}

export async function provisionRoomStream(roomId: string): Promise<IvsProvisionResult> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      streamProvider: true,
      ivsChannelArn: true,
      ivsChannelName: true,
      ivsPlaybackUrl: true,
      ivsIngestEndpoint: true,
      ivsStreamKeyArn: true,
    },
  });
  if (!room) throw new Error("Live room not found.");

  if (
    room.streamProvider === "aws_ivs" &&
    room.ivsChannelArn &&
    room.ivsChannelName &&
    room.ivsPlaybackUrl &&
    room.ivsIngestEndpoint &&
    room.ivsStreamKeyArn
  ) {
    await ensureChannelRecordingConfiguration(room.ivsChannelArn);
    const rotated = await rotateStreamKey(roomId, room.ivsChannelArn, room.ivsStreamKeyArn);
    return {
      roomId,
      playbackUrl: room.ivsPlaybackUrl,
      ingestEndpoint: room.ivsIngestEndpoint,
      streamKeyValue: rotated.streamKeyValue,
      streamKeyArn: rotated.streamKeyArn,
      channelArn: room.ivsChannelArn,
      channelName: room.ivsChannelName,
      streamHealth: "offline",
    };
  }

  const channel = await createChannel(roomId);
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      streamProvider: "aws_ivs",
      streamHealth: "offline",
      ivsChannelArn: channel.arn,
      ivsChannelName: channel.name,
      ivsPlaybackUrl: channel.playbackUrl,
      ivsIngestEndpoint: channel.ingestEndpoint,
      ivsStreamKeyArn: channel.streamKeyArn,
      ivsStreamKeyCreatedAt: now,
      streamEndedAt: now,
      streamStartedAt: null,
      lastIvsStatusSyncAt: now,
      lastIvsError: null,
    },
  });

  return {
    roomId,
    playbackUrl: channel.playbackUrl,
    ingestEndpoint: channel.ingestEndpoint,
    streamKeyValue: channel.streamKeyValue,
    streamKeyArn: channel.streamKeyArn,
    channelArn: channel.arn,
    channelName: channel.name,
    streamHealth: "offline",
  };
}

export async function rotateStreamKey(roomId: string, channelArn?: string, currentKeyArn?: string) {
  const room =
    channelArn && currentKeyArn
      ? {
          ivsChannelArn: channelArn,
          ivsStreamKeyArn: currentKeyArn,
        }
      : await prisma.liveRoom.findUnique({
          where: { id: roomId },
          select: { ivsChannelArn: true, ivsStreamKeyArn: true },
        });

  if (!room?.ivsChannelArn) {
    throw new Error("This room does not have an IVS channel yet.");
  }

  const client = makeClient();
  if (room.ivsStreamKeyArn) {
    await client.send(new DeleteStreamKeyCommand({ arn: room.ivsStreamKeyArn }));
  }

  const nextKey = await createStreamKey(room.ivsChannelArn);
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      ivsStreamKeyArn: nextKey.arn,
      ivsStreamKeyCreatedAt: new Date(),
      lastIvsError: null,
    },
  });
  return {
    streamKeyArn: nextKey.arn,
    streamKeyValue: nextKey.value,
  };
}

export async function stopStream(roomId: string) {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsChannelArn: true },
  });
  if (!room?.ivsChannelArn) {
    throw new Error("This room does not have an IVS channel.");
  }

  const client = makeClient();
  await client.send(new StopStreamCommand({ channelArn: room.ivsChannelArn }));
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      streamHealth: "ended",
      streamEndedAt: now,
      lastIvsStatusSyncAt: now,
      lastIvsError: null,
    },
  });
  logIvsOpsServer("ivs_stop_stream_command", { roomId });
}

export type IvsWebBroadcastPreset = "STANDARD_LANDSCAPE" | "BASIC_LANDSCAPE";

export type IvsWebBroadcastSession = {
  roomId: string;
  ingestEndpoint: string;
  streamKeyValue: string;
  streamConfigPreset: IvsWebBroadcastPreset;
};

function webBroadcastPresetForChannel(): IvsWebBroadcastPreset {
  const env = getEnv();
  return env.channelType === "BASIC" ? "BASIC_LANDSCAPE" : "STANDARD_LANDSCAPE";
}

/** Ensures the room IVS channel exists, rotates the stream key, and returns host-only ingest credentials. */
export async function prepareHostWebBroadcastSession(roomId: string): Promise<IvsWebBroadcastSession> {
  const provisioned = await provisionRoomStream(roomId);
  return {
    roomId,
    ingestEndpoint: provisioned.ingestEndpoint,
    streamKeyValue: provisioned.streamKeyValue,
    streamConfigPreset: webBroadcastPresetForChannel(),
  };
}

/** Stops the IVS broadcast and rotates the stream key so browser credentials cannot be reused. */
export async function endHostWebBroadcastSession(roomId: string): Promise<void> {
  try {
    await stopStream(roomId);
  } catch {
    /** Channel may already be offline; still rotate the key. */
  }
  await rotateStreamKey(roomId);
}

/* ───────────────────────────── IVS Real-Time (WebRTC Stages) ─────────────────────────────
 * Sub-second WebRTC path for browser/mobile Go Live. Host publishes camera/mic into a Stage,
 * buyers subscribe as viewers. The IVS Low-Latency/HLS channel remains the OBS path and a
 * fallback/overflow/replay surface (optionally mirrored from the Stage via StartComposition).
 */

/**
 * Host token TTL (minutes). AWS default/max-practical is 720 (12h); keep shows alive without
 * requiring a mobile client refresh. Existing app builds pick this up on the next Go Live (POST).
 */
const HOST_STAGE_TOKEN_MINUTES = 720;
/** Viewer token TTL (minutes). Short-lived, subscribe-only; clients re-fetch on expiry/reconnect. */
const VIEWER_STAGE_TOKEN_MINUTES = 20;

export type StageProvisionResult = { stageArn: string };
export type StageToken = {
  token: string;
  participantId: string;
  stageArn: string;
  /** TTL in seconds so the client can schedule a refresh before expiry. */
  expiresInSeconds: number;
};

function makeRealTimeClient() {
  const env = getEnv();
  return new IVSRealTimeClient({
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

function createStageName(roomId: string): string {
  const sanitized = roomId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 40);
  return `vaulted-stage-${sanitized}-${Date.now()}`;
}

/** Whether the stage->channel HLS composition (guest HLS / failover mirror) is enabled via env. */
function stageCompositionEnabled(): boolean {
  const raw = process.env.LIVE_STAGE_COMPOSITION_ENABLED?.trim().toLowerCase();
  if (raw === "false") return false;
  // Default on: mirror Stage → IVS channel so guest HLS and WebRTC→HLS failover have segments.
  return true;
}

/** Idempotently create (and persist) the room's IVS Real-Time Stage. */
export async function provisionRoomStage(roomId: string): Promise<StageProvisionResult> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { id: true, ivsStageArn: true },
  });
  if (!room) throw new Error("Live room not found.");
  if (room.ivsStageArn) return { stageArn: room.ivsStageArn };

  const client = makeRealTimeClient();
  const out = await client.send(
    new CreateStageCommand({
      name: createStageName(roomId),
      tags: { app: "vaulted-live", roomId },
    }),
  );
  const stageArn = out.stage?.arn;
  if (!stageArn) {
    throw new Error("IVS stage provisioning failed. Missing stage ARN from AWS.");
  }

  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { streamProvider: "aws_ivs", streamMode: "stage_webrtc", ivsStageArn: stageArn },
  });
  logIvsOpsServer("ivs_stage_created", { roomId });
  return { stageArn };
}

async function createStageToken(
  roomId: string,
  capabilities: ParticipantTokenCapability[],
  attributes: Record<string, string>,
  durationMinutes: number,
): Promise<StageToken> {
  const { stageArn } = await provisionRoomStage(roomId);
  const client = makeRealTimeClient();
  const out = await client.send(
    new CreateParticipantTokenCommand({
      stageArn,
      capabilities,
      duration: durationMinutes,
      attributes,
    }),
  );
  const token = out.participantToken?.token;
  const participantId = out.participantToken?.participantId;
  if (!token || !participantId) {
    throw new Error("IVS participant token creation failed.");
  }
  return { token, participantId, stageArn, expiresInSeconds: durationMinutes * 60 };
}

/** Host publish+subscribe token. Capable of publishing camera/mic into the stage. */
export async function createHostStageToken(roomId: string, userId: string): Promise<StageToken> {
  return createStageToken(
    roomId,
    [ParticipantTokenCapability.PUBLISH, ParticipantTokenCapability.SUBSCRIBE],
    { role: "host", userId },
    HOST_STAGE_TOKEN_MINUTES,
  );
}

/** Fresh host publish token for an active Stage session (mid-show reconnect). Does not reset stream health. */
export async function refreshHostStageToken(roomId: string, userId: string): Promise<StageToken> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsStageArn: true, streamMode: true, streamHealth: true, status: true },
  });
  if (!room?.ivsStageArn) {
    throw new Error("This room is not streaming over WebRTC.");
  }
  if (room.streamMode !== "stage_webrtc") {
    throw new Error("Room is not in WebRTC stage mode.");
  }
  const liveish =
    room.streamHealth === "live" ||
    room.streamHealth === "connecting" ||
    room.status === "live";
  if (!liveish) {
    throw new Error("Stream is not active.");
  }
  return createHostStageToken(roomId, userId);
}

/** Buyer subscribe-only token. Cannot publish (no camera/mic into the stage). */
export async function createViewerStageToken(roomId: string, userId: string): Promise<StageToken> {
  return createStageToken(
    roomId,
    [ParticipantTokenCapability.SUBSCRIBE],
    { role: "viewer", userId },
    VIEWER_STAGE_TOKEN_MINUTES,
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Best-effort: mirror the Stage into the existing IVS channel for HLS fallback/overflow/replay.
 * Gated by `LIVE_STAGE_COMPOSITION_ENABLED`; never throws (the WebRTC path must work regardless).
 * Guests (unauthenticated web viewers) can never use WebRTC, so they depend entirely on this
 * mirror — failures here are persisted to `lastIvsError` (and always console-logged, bypassing the
 * ops-log gate) since a silent failure means every guest link is permanently unwatchable.
 */
export async function startStageHlsComposition(roomId: string): Promise<string | null> {
  if (!stageCompositionEnabled()) return null;
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsStageArn: true, ivsChannelArn: true, ivsCompositionArn: true },
  });
  if (!room?.ivsStageArn || !room.ivsChannelArn) return null;
  if (room.ivsCompositionArn) return room.ivsCompositionArn;

  const encoderConfigurationArn = process.env.LIVE_STAGE_ENCODER_CONFIG_ARN?.trim();
  // Extra attempts: composition needs the host publisher on the Stage first.
  const attempts = [0, 2_000, 5_000, 10_000, 15_000];
  let lastErr: unknown = null;
  for (const delayMs of attempts) {
    if (delayMs > 0) await sleep(delayMs);
    try {
      const client = makeRealTimeClient();
      const out = await client.send(
        new StartCompositionCommand({
          stageArn: room.ivsStageArn,
          destinations: [
            {
              channel: {
                channelArn: room.ivsChannelArn,
                ...(encoderConfigurationArn ? { encoderConfigurationArn } : {}),
              },
            },
          ],
        }),
      );
      const arn = out.composition?.arn ?? null;
      if (arn) {
        await prisma.liveRoom.update({
          where: { id: roomId },
          data: { ivsCompositionArn: arn, lastIvsError: null },
        });
      }
      logIvsOpsServer("ivs_stage_composition_start", { roomId, started: Boolean(arn) });
      return arn;
    } catch (err) {
      lastErr = err;
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : "Unknown composition start failure.";
  const errorName = lastErr instanceof Error ? lastErr.name : "unknown";
  // Never gated by IVS_OPS_LOG — this failure means guest HLS is dead for the whole show.
  console.error("[IVS_OPS] ivs_stage_composition_start_failure", { roomId, errorName, message });
  await prisma.liveRoom
    .update({ where: { id: roomId }, data: { lastIvsError: `stage_composition_start_failed: ${message}`.slice(0, 500) } })
    .catch(() => {});
  return null;
}

/**
 * Read the live AWS state of a composition: its overall state plus the state of its channel
 * destination. Returns nulls (never throws) when the composition is gone or AWS is unreachable.
 */
export async function getCompositionStatus(
  compositionArn: string,
): Promise<{ compositionState: string | null; destinationState: string | null }> {
  try {
    const client = makeRealTimeClient();
    const out = await client.send(new GetCompositionCommand({ arn: compositionArn }));
    const compositionState = out.composition?.state ?? null;
    const destinationState = out.composition?.destinations?.[0]?.state ?? null;
    return { compositionState, destinationState };
  } catch {
    /** Composition expired/not found or AWS unreachable — treat as unknown. */
    return { compositionState: null, destinationState: null };
  }
}

/**
 * Count participants currently PUBLISHING (host camera/mic) on a Stage's active session.
 * Returns `null` when the state can't be determined (no session yet or AWS error) so callers can
 * treat "unknown" differently from a confirmed zero. Never throws.
 */
export async function countStagePublishers(stageArn: string): Promise<number | null> {
  try {
    const client = makeRealTimeClient();
    const sessions = await client.send(new ListStageSessionsCommand({ stageArn }));
    const active = (sessions.stageSessions ?? []).find((s) => !s.endTime) ?? (sessions.stageSessions ?? [])[0];
    const sessionId = active?.sessionId;
    if (!sessionId) return null;
    const participants = await client.send(
      new ListParticipantsCommand({ stageArn, sessionId, filterByPublished: true }),
    );
    return (participants.participants ?? []).length;
  } catch {
    return null;
  }
}

/**
 * Publisher-derived health for Stage rooms — bypasses the channel-poll ignore path.
 * Use this when we know whether a host is actually publishing (countStagePublishers).
 */
export async function commitStagePublisherDerivedHealth(
  roomId: string,
  newHealth: Extract<LiveStreamHealth, "live" | "connecting">,
): Promise<"updated" | "unchanged" | "missing"> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamHealth: true, streamStartedAt: true, status: true, streamMode: true },
  });
  if (!room || room.status !== "live" || room.streamMode !== "stage_webrtc") return "missing";
  if (room.streamHealth === newHealth) {
    await prisma.liveRoom
      .update({ where: { id: roomId }, data: { lastIvsStatusSyncAt: new Date() } })
      .catch(() => {});
    return "unchanged";
  }

  const now = new Date();
  const data: {
    streamHealth: LiveStreamHealth;
    lastIvsStatusSyncAt: Date;
    lastIvsError: null;
    roomVersion: { increment: number };
    streamStartedAt?: Date;
    streamEndedAt?: Date | null;
    hostAbsentSince?: Date | null;
  } = {
    streamHealth: newHealth,
    lastIvsStatusSyncAt: now,
    lastIvsError: null,
    roomVersion: { increment: 1 },
  };
  if (newHealth === "live") {
    if (!room.streamStartedAt) data.streamStartedAt = now;
    data.streamEndedAt = null;
    data.hostAbsentSince = null;
  }

  const updated = await prisma.liveRoom.update({
    where: { id: roomId },
    data,
    select: { roomVersion: true },
  });

  emitStreamStatusChanged(roomId, {
    streamHealth: newHealth,
    roomVersion: updated.roomVersion,
    lastStatusSyncAt: now.toISOString(),
  });
  logIvsOpsServer("ivs_stage_publisher_health", {
    roomId,
    from: room.streamHealth,
    to: newHealth,
  });
  return "updated";
}

/**
 * Reconcile `streamHealth` from real Stage publishers.
 * - Publisher present → `live` (video can flow / HLS mirror can source).
 * - No publisher after go-live grace → `connecting` (honest “waiting on host”, not fake live).
 * Never ends the room; never throws.
 */
export async function reconcileStagePublisherHealth(roomId: string): Promise<"live" | "connecting" | "unknown" | "skip"> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: {
      status: true,
      streamMode: true,
      ivsStageArn: true,
      streamStartedAt: true,
      streamHealth: true,
    },
  });
  if (!room || room.status !== "live" || room.streamMode !== "stage_webrtc" || !room.ivsStageArn) {
    return "skip";
  }

  const publishers = await countStagePublishers(room.ivsStageArn);
  if (publishers === null) return "unknown";

  if (publishers > 0) {
    await commitStagePublisherDerivedHealth(roomId, "live");
    return "live";
  }

  const msSinceStart = room.streamStartedAt ? Date.now() - room.streamStartedAt.getTime() : Number.POSITIVE_INFINITY;
  // Match stuck-recovery grace — don't flap to connecting during the first minute of Go Live.
  if (msSinceStart < 60_000) return "skip";

  await commitStagePublisherDerivedHealth(roomId, "connecting");
  return "connecting";
}

/**
 * Self-heal Stage→HLS mirror for guests / buyer failover.
 *
 * Anti-thrash: a freshly started composition needs ~15–30s before its channel destination reports
 * LIVE. We therefore consult the composition's *actual* AWS state and only recycle a composition
 * that is confirmed dead (see `decideCompositionHealAction`). Restarting a still-warming composition
 * (the old behavior) meant the HLS mirror could never come up. Do not restart while the channel is
 * live/connecting (that thrash blacked out buyers). Caller is rate-limited (buyer stream poll ~30s).
 */
export async function ensureStageHlsCompositionActive(roomId: string): Promise<void> {
  if (!stageCompositionEnabled()) return;
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: {
      streamMode: true,
      streamHealth: true,
      ivsCompositionArn: true,
      ivsStageArn: true,
      ivsChannelArn: true,
      streamStartedAt: true,
    },
  });
  if (!room || room.streamMode !== "stage_webrtc") return;
  if (!room.ivsStageArn || !room.ivsChannelArn) return;
  const health = room.streamHealth?.toLowerCase();
  if (health !== "live" && health !== "connecting") return;

  let compositionState: string | null = null;
  let destinationState: string | null = null;
  let channelHealth: string | null = null;
  if (room.ivsCompositionArn) {
    ({ health: channelHealth } = await getStreamStatus(room.ivsChannelArn));
    // Only probe the composition's AWS state when the channel isn't already flowing — this avoids
    // an extra GetComposition call on the common healthy path and only inspects state when we might
    // actually need to recycle a dead mirror.
    if (channelHealth !== "live" && channelHealth !== "connecting") {
      ({ compositionState, destinationState } = await getCompositionStatus(room.ivsCompositionArn));
    }
  }

  const action = decideCompositionHealAction({
    hasComposition: Boolean(room.ivsCompositionArn),
    compositionState,
    destinationState,
    channelHealth,
    msSinceStreamStart: room.streamStartedAt
      ? Date.now() - room.streamStartedAt.getTime()
      : Number.POSITIVE_INFINITY,
  });

  if (action === "skip") return;

  if (action === "replace") {
    logIvsOpsServer("ivs_stage_composition_replace_dead", {
      roomId,
      channelHealth,
      compositionState,
      destinationState,
    });
    await stopStageComposition(roomId);
  }
  cancelDelayedCompositionStop(roomId);
  await startStageHlsComposition(roomId);
}

/** Stop the stage->channel composition (if any). Never throws. */
export async function stopStageComposition(roomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsCompositionArn: true },
  });
  if (!room?.ivsCompositionArn) return;
  const client = makeRealTimeClient();
  try {
    await client.send(new StopCompositionCommand({ arn: room.ivsCompositionArn }));
  } catch {
    /** Composition may already be stopped/expired. */
  }
  await prisma.liveRoom.update({ where: { id: roomId }, data: { ivsCompositionArn: null } });
  logIvsOpsServer("ivs_stage_composition_stop", { roomId });
}

/** Delayed HLS teardown so a host phone fatal/retry doesn't black out buyers instantly. */
const delayedCompositionStops = new Map<string, ReturnType<typeof setTimeout>>();

function cancelDelayedCompositionStop(roomId: string): void {
  const timer = delayedCompositionStops.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  delayedCompositionStops.delete(roomId);
}

/**
 * Begin a host WebRTC Stage broadcast: provision the stage, mint a publish token, mark the room
 * live (stage mode), and kick off the optional HLS mirror. Returns the host's publish token.
 */
export async function prepareHostStageSession(roomId: string, userId: string): Promise<StageToken> {
  cancelDelayedCompositionStop(roomId);
  const existing = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsChannelArn: true, ivsPlaybackUrl: true },
  });
  if (!existing?.ivsChannelArn || !existing?.ivsPlaybackUrl) {
    await provisionRoomStream(roomId);
  }
  const token = await createHostStageToken(roomId, userId);
  const now = new Date();
  // Mark stream connecting + return token immediately. Do NOT stamp streamHealth=live until a
  // publisher is confirmed (buyer polls / stuck recovery) — fake "live" with no camera is what
  // blacks out viewers and makes Retry look dead. Do NOT await HLS composition here — retries can
  // take 15–20s+ and the mobile client aborts, leaving Go Live stuck on a spinner.
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      streamProvider: "aws_ivs",
      streamMode: "stage_webrtc",
      streamHealth: "connecting",
      streamStartedAt: now,
      streamEndedAt: null,
      lastIvsStatusSyncAt: now,
      lastIvsError: null,
      hostAbsentSince: null,
    },
  });
  logIvsOpsServer("ivs_stage_broadcast_start", { roomId });
  // Host must publish first; then start (or replace a dead) HLS mirror for guests.
  void (async () => {
    await sleep(6_000);
    cancelDelayedCompositionStop(roomId);
    const room = await prisma.liveRoom.findUnique({
      where: { id: roomId },
      select: { ivsCompositionArn: true, ivsChannelArn: true, streamHealth: true, status: true },
    });
    if (!room || room.status !== "live") return;
    // Promote health if the host already published during the delay.
    await reconcileStagePublisherHealth(roomId);
    const refreshed = await prisma.liveRoom.findUnique({
      where: { id: roomId },
      select: { streamHealth: true, ivsCompositionArn: true, ivsChannelArn: true },
    });
    if (!refreshed) return;
    if (refreshed.streamHealth !== "live" && refreshed.streamHealth !== "connecting") return;
    if (refreshed.ivsCompositionArn && refreshed.ivsChannelArn) {
      const { health: channelHealth } = await getStreamStatus(refreshed.ivsChannelArn);
      if (channelHealth === "live" || channelHealth === "connecting") return;
      await stopStageComposition(roomId);
    }
    await startStageHlsComposition(roomId);
  })().catch((err) => {
    console.error("[IVS_OPS] ivs_stage_composition_start_deferred_failure", {
      roomId,
      message: err instanceof Error ? err.message : String(err),
    });
  });
  return token;
}

/**
 * Tear down Stage broadcast resources.
 *
 * Soft disconnect: if the live *room* is still `live`, a host client DROP/DELETE must NOT
 * mark streamHealth ended — buyers treat that as "stream over" and go black even though the
 * show is still open. Host taps Go Live again to republish. Hard teardown runs only after
 * End Show sets room status to `ended` (or cancel/admin).
 */
export async function endHostStageSession(roomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  if (room?.status === "live") {
    cancelDelayedCompositionStop(roomId);
    // Soft disconnect: room stays live so host can Go Live again, but stop lying that video is up.
    await commitStagePublisherDerivedHealth(roomId, "connecting").catch(() => {});
    logIvsOpsServer("ivs_stage_broadcast_soft_disconnect", { roomId });
    return;
  }

  await stopStageComposition(roomId);
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { streamHealth: "ended", streamEndedAt: now, streamPaused: false, lastIvsStatusSyncAt: now },
  });
  logIvsOpsServer("ivs_stage_broadcast_stop", { roomId });
}

/** Tear down a room's stage entirely (e.g. room deletion). Best-effort; never throws. */
export async function deleteRoomStage(roomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { ivsStageArn: true },
  });
  if (!room?.ivsStageArn) return;
  await stopStageComposition(roomId);
  const client = makeRealTimeClient();
  try {
    await client.send(new DeleteStageCommand({ arn: room.ivsStageArn }));
  } catch {
    /** Stage may already be deleted. */
  }
  await prisma.liveRoom.update({ where: { id: roomId }, data: { ivsStageArn: null } });
}
