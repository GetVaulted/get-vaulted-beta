import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUnique,
  count,
  updateMany,
  upsertTeamBoard,
  findUser,
  getSellerLiveReadiness,
  emitAuctionStarted,
  emitLiveDiscoveryChanged,
  emitTeamBoardChanged,
  notifyFollowers,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  upsertTeamBoard: vi.fn(),
  findUser: vi.fn(),
  getSellerLiveReadiness: vi.fn(),
  emitAuctionStarted: vi.fn(),
  emitLiveDiscoveryChanged: vi.fn(),
  emitTeamBoardChanged: vi.fn(),
  notifyFollowers: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findUnique,
      count,
      updateMany,
    },
    liveRoomTeamBoard: {
      upsert: upsertTeamBoard,
    },
    user: {
      findUnique: findUser,
    },
  },
}));

vi.mock("@/services/seller/live-show-readiness", () => ({
  getSellerLiveReadiness,
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitAuctionStarted,
  emitLiveDiscoveryChanged,
  emitTeamBoardChanged,
}));

vi.mock("@/lib/seller-follow-notify", () => ({
  notifyFollowersSellerWentLive: (...args: unknown[]) => notifyFollowers(...args),
}));

vi.mock("@/lib/ivs-ops-log", () => ({
  logIvsOpsServer: vi.fn(),
}));

import { maybeAutoStartObsRoomOnIngestSignal } from "@/lib/live-obs-auto-start";

describe("maybeAutoStartObsRoomOnIngestSignal", () => {
  beforeEach(() => {
    findUnique.mockReset();
    count.mockReset();
    updateMany.mockReset();
    upsertTeamBoard.mockReset();
    findUser.mockReset();
    getSellerLiveReadiness.mockReset();
    emitAuctionStarted.mockReset();
    emitLiveDiscoveryChanged.mockReset();
    emitTeamBoardChanged.mockReset();
    notifyFollowers.mockReset();
    count.mockResolvedValue(0);
    getSellerLiveReadiness.mockResolvedValue({ canGoLive: true, issues: [], checks: {} });
    notifyFollowers.mockResolvedValue(undefined);
  });

  it("starts a scheduled OBS room when ingest is live", async () => {
    findUnique
      .mockResolvedValueOnce({
        id: "room-1",
        status: "scheduled",
        streamMode: "channel_hls",
        streamHealth: "live",
        sellerId: "seller-1",
        roomType: "auction",
        discoveryVisibility: "public",
        teamBoardLeague: null,
      })
      .mockResolvedValueOnce({ roomVersion: 2 });
    updateMany.mockResolvedValue({ count: 1 });
    findUser.mockResolvedValue({ username: "host" });

    const started = await maybeAutoStartObsRoomOnIngestSignal("room-1");

    expect(started).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room-1", status: "scheduled" },
        data: expect.objectContaining({ status: "live" }),
      }),
    );
    expect(emitAuctionStarted).toHaveBeenCalledWith("room-1", 2);
    expect(emitLiveDiscoveryChanged).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room-1", status: "live", reason: "obs_ingest_auto_start" }),
    );
    expect(notifyFollowers).toHaveBeenCalled();
  });

  it("does not start phone Stage rooms automatically", async () => {
    findUnique.mockResolvedValueOnce({
      id: "room-2",
      status: "scheduled",
      streamMode: "stage_webrtc",
      streamHealth: "live",
      sellerId: "seller-1",
      roomType: "auction",
      discoveryVisibility: "public",
      teamBoardLeague: null,
    });

    const started = await maybeAutoStartObsRoomOnIngestSignal("room-2");

    expect(started).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ignores offline health", async () => {
    findUnique.mockResolvedValueOnce({
      id: "room-3",
      status: "scheduled",
      streamMode: "channel_hls",
      streamHealth: "offline",
      sellerId: "seller-1",
      roomType: "auction",
      discoveryVisibility: "public",
      teamBoardLeague: null,
    });

    const started = await maybeAutoStartObsRoomOnIngestSignal("room-3");

    expect(started).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("blocks when seller already has another live show", async () => {
    findUnique.mockResolvedValueOnce({
      id: "room-4",
      status: "scheduled",
      streamMode: "channel_hls",
      streamHealth: "connecting",
      sellerId: "seller-1",
      roomType: "auction",
      discoveryVisibility: "public",
      teamBoardLeague: null,
    });
    count.mockResolvedValue(1);

    const started = await maybeAutoStartObsRoomOnIngestSignal("room-4");

    expect(started).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
