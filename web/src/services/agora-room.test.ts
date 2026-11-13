import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { liveRoom: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));

const backupActive = vi.fn();
const cloudflareConfigured = vi.fn();
const getInput = vi.fn();
vi.mock("@/services/cloudflare-stream", () => ({
  isBackupLiveVideoActive: () => backupActive(),
  isCloudflareStreamConfigured: () => cloudflareConfigured(),
  getCloudflareLiveInput: (...a: unknown[]) => getInput(...a),
}));
vi.mock("@/services/cloudflare-stream-room", () => ({ provisionCloudflareRoomStream: vi.fn() }));

const agoraConfigured = vi.fn();
const getRelay = vi.fn();
const startRelay = vi.fn();
const stopRelay = vi.fn();
vi.mock("@/services/agora-rtc", async () => {
  const actual = await vi.importActual<typeof import("@/services/agora-rtc")>("@/services/agora-rtc");
  return {
    ...actual,
    isAgoraConfigured: () => agoraConfigured(),
    getAgoraRelay: (...a: unknown[]) => getRelay(...a),
    startAgoraRelay: (...a: unknown[]) => startRelay(...a),
    stopAgoraRelay: (...a: unknown[]) => stopRelay(...a),
  };
});

import { ensureAgoraRelay, resolveHostPublisher } from "./agora-room";

beforeEach(() => {
  vi.clearAllMocks();
  backupActive.mockResolvedValue(true);
  cloudflareConfigured.mockReturnValue(true);
  agoraConfigured.mockReturnValue(true);
});

describe("resolveHostPublisher", () => {
  it("uses AWS when the switch is off", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline", phoneRelay: false });
    backupActive.mockResolvedValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("uses Agora when the switch is on and both providers are configured", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline", phoneRelay: false });
    expect(await resolveHostPublisher("r1")).toBe("agora");
  });

  it("falls back to AWS if either provider is not configured", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", streamHealth: "offline", phoneRelay: false });
    agoraConfigured.mockReturnValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
    agoraConfigured.mockReturnValue(true);
    cloudflareConfigured.mockReturnValue(false);
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("never moves a running AWS show", async () => {
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "live", phoneRelay: false });
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "connecting", phoneRelay: false });
    expect(await resolveHostPublisher("r1")).toBe("aws_ivs");
  });

  it("keeps a phone-relay show on Agora even after the switch is turned off", async () => {
    findUnique.mockResolvedValue({ streamProvider: "cloudflare_stream", streamHealth: "live", phoneRelay: true });
    backupActive.mockResolvedValue(false);
    expect(await resolveHostPublisher("r1")).toBe("agora");
  });

  it("an ended AWS show does not block a new Agora start", async () => {
    findUnique.mockResolvedValue({ streamProvider: "aws_ivs", streamHealth: "ended", phoneRelay: false });
    expect(await resolveHostPublisher("r1")).toBe("agora");
  });
});

describe("ensureAgoraRelay", () => {
  const room = { streamProvider: "cloudflare_stream", externalStreamId: "uid1", externalRelayId: null as string | null };

  it("starts a relay to the Cloudflare ingest and records the converter id", async () => {
    findUnique.mockResolvedValue(room);
    getInput.mockResolvedValue({ rtmpsUrl: "rtmps://live.cloudflare.com:443/live/", streamKey: "k1" });
    startRelay.mockResolvedValue({ converterId: "c1", state: "connecting" });
    const out = await ensureAgoraRelay("r1");
    expect(startRelay).toHaveBeenCalledWith({ roomId: "r1", rtmpUrl: "rtmps://live.cloudflare.com:443/live/k1" });
    expect(update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { externalRelayId: "c1" } });
    expect(out).toEqual({ converterId: "c1", state: "connecting", started: true });
  });

  it("leaves a running relay alone", async () => {
    findUnique.mockResolvedValue({ ...room, externalRelayId: "c1" });
    getRelay.mockResolvedValue({ converterId: "c1", state: "running" });
    const out = await ensureAgoraRelay("r1");
    expect(startRelay).not.toHaveBeenCalled();
    expect(out.started).toBe(false);
  });

  it("replaces a failed or vanished relay", async () => {
    findUnique.mockResolvedValue({ ...room, externalRelayId: "old" });
    getRelay.mockResolvedValue({ converterId: "old", state: "failed" });
    getInput.mockResolvedValue({ rtmpsUrl: "rtmps://x/live/", streamKey: "k" });
    startRelay.mockResolvedValue({ converterId: "new", state: "connecting" });
    const out = await ensureAgoraRelay("r1");
    expect(stopRelay).toHaveBeenCalledWith("old");
    expect(out.converterId).toBe("new");
  });

  it("requires the room to be set up first", async () => {
    findUnique.mockResolvedValue({ streamProvider: "none", externalStreamId: null, externalRelayId: null });
    await expect(ensureAgoraRelay("r1")).rejects.toThrow(/not set up/);
  });
});
