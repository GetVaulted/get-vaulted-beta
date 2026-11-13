import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { liveRoom: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));
vi.mock("@/lib/ivs-ops-log", () => ({ logIvsOpsServer: vi.fn() }));

const backupActive = vi.fn();
vi.mock("@/services/cloudflare-stream", () => ({ isBackupLiveVideoActive: () => backupActive() }));

const agoraConfigured = vi.fn();
vi.mock("@/services/agora-rtc", async () => {
  const actual = await vi.importActual<typeof import("@/services/agora-rtc")>("@/services/agora-rtc");
  return {
    ...actual,
    isAgoraConfigured: () => agoraConfigured(),
    createAgoraHostSession: (id: string) => ({ appId: "app", channel: `gv-${id}`, uid: 7, token: "tok", expiresInSeconds: 1 }),
  };
});

import {
  AGORA_HOST_STALE_MS,
  confirmAgoraHostLive,
  demoteStaleAgoraHealth,
  endAgoraHostSession,
  prepareAgoraHostSession,
  resolveHostPublisher,
} from "./agora-room";

beforeEach(() => {
  vi.clearAllMocks();
  backupActive.mockResolvedValue(true);
  agoraConfigured.mockReturnValue(true);
});

describe("resolveHostPublisher", () => {
  it("uses AWS when the switch is off", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline" });
    backupActive.mockResolvedValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("uses Agora when the switch is on and Agora is configured", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline" });
    expect(await resolveHostPublisher("r1")).toBe("agora");
  });

  it("falls back to AWS if Agora is not configured", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline" });
    agoraConfigured.mockReturnValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("never moves a running AWS show", async () => {
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "live" });
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "connecting" });
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("keeps a running Agora show on Agora even after the switch is turned off", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", streamHealth: "live" });
    backupActive.mockResolvedValue(false);
    expect(await resolveHostPublisher("r1")).toBe("agora");
  });

  it("lets the switch decide again once an Agora show has ended", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", streamHealth: "ended" });
    backupActive.mockResolvedValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });
});

describe("prepareAgoraHostSession", () => {
  it("marks the room as an Agora phone show that is still connecting, and returns the host pass", async () => {
    const session = await prepareAgoraHostSession("r1");
    expect(session.channel).toBe("gv-r1");
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      streamProvider: "agora_rtc",
      streamMode: "stage_webrtc",
      streamHealth: "connecting",
      streamEndedAt: null,
      phoneRelay: true,
    });
  });
});

describe("confirmAgoraHostLive", () => {
  it("turns an Agora room live and reports the change", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", streamHealth: "connecting", status: "live" });
    expect(await confirmAgoraHostLive("r1")).toBe(true);
    expect(update.mock.calls[0][0].data.streamHealth).toBe("live");
  });

  it("a heartbeat on an already-live room refreshes the clock without reporting a change", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", streamHealth: "live", status: "live" });
    expect(await confirmAgoraHostLive("r1")).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("ignores rooms that are not on Agora or already ended", async () => {
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "live", status: "live" });
    expect(await confirmAgoraHostLive("r1")).toBe(false);
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", streamHealth: "live", status: "ended" });
    expect(await confirmAgoraHostLive("r1")).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("endAgoraHostSession", () => {
  it("keeps a still-live show open (connecting) so the seller can Go Live again", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", status: "live" });
    await endAgoraHostSession("r1");
    expect(update.mock.calls[0][0].data.streamHealth).toBe("connecting");
  });

  it("marks a finished show ended", async () => {
    findUnique.mockResolvedValue({ streamProvider: "agora_rtc", status: "ended" });
    await endAgoraHostSession("r1");
    expect(update.mock.calls[0][0].data).toMatchObject({ streamHealth: "ended", streamPaused: false });
  });

  it("does nothing for non-Agora rooms", async () => {
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", status: "live" });
    await endAgoraHostSession("r1");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("demoteStaleAgoraHealth", () => {
  const now = new Date("2026-11-14T00:00:00Z");

  it("drops a live room with no recent heartbeat to connecting", async () => {
    findUnique.mockResolvedValue({
      streamProvider: "agora_rtc",
      streamHealth: "live",
      streamPaused: false,
      lastIvsStatusSyncAt: new Date(now.getTime() - AGORA_HOST_STALE_MS - 1000),
    });
    expect(await demoteStaleAgoraHealth("r1", now)).toBe(true);
    expect(update.mock.calls[0][0].data.streamHealth).toBe("connecting");
  });

  it("leaves a fresh, paused, or non-Agora room alone", async () => {
    findUnique.mockResolvedValue({
      streamProvider: "agora_rtc",
      streamHealth: "live",
      streamPaused: false,
      lastIvsStatusSyncAt: new Date(now.getTime() - 10_000),
    });
    expect(await demoteStaleAgoraHealth("r1", now)).toBe(false);
    findUnique.mockResolvedValue({
      streamProvider: "agora_rtc",
      streamHealth: "live",
      streamPaused: true,
      lastIvsStatusSyncAt: new Date(now.getTime() - 999_999),
    });
    expect(await demoteStaleAgoraHealth("r1", now)).toBe(false);
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "live", streamPaused: false, lastIvsStatusSyncAt: null });
    expect(await demoteStaleAgoraHealth("r1", now)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
