import {
  CreateChannelCommand,
  CreateStreamKeyCommand,
  DeleteStreamKeyCommand,
  GetStreamCommand,
  StopStreamCommand,
  IvsClient,
  type ChannelLatencyMode,
  type ChannelType,
  type StreamState,
} from "@aws-sdk/client-ivs";
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

export async function createChannel(roomId: string) {
  const env = getEnv();
  const client = makeClient();
  const inputName = createChannelName(roomId);
  const out = await client.send(
    new CreateChannelCommand({
      name: inputName,
      type: env.channelType,
      latencyMode: env.latencyMode,
      tags: {
        app: "vaulted-live",
        roomId,
      },
    }),
  );
  if (!out.channel?.arn || !out.channel?.playbackUrl || !out.channel?.ingestEndpoint || !out.channel?.name) {
    throw new Error("IVS channel provisioning failed. Missing channel details from AWS.");
  }
  return {
    arn: out.channel.arn,
    playbackUrl: out.channel.playbackUrl,
    ingestEndpoint: out.channel.ingestEndpoint,
    name: out.channel.name,
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
    streamEndedAt?: Date;
  } = {
    streamHealth: newHealth,
    lastIvsStatusSyncAt: now,
    lastIvsError: null,
    roomVersion: { increment: 1 },
  };

  if (newHealth === "live" && !room.streamStartedAt) {
    data.streamStartedAt = now;
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
  const streamKey = await createStreamKey(channel.arn);
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
      ivsStreamKeyArn: streamKey.arn,
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
    streamKeyValue: streamKey.value,
    streamKeyArn: streamKey.arn,
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
