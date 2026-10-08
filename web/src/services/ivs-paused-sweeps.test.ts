import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: the 10-minute cleanup sweeps used to end any live show whose host publisher was gone.
 * A PAUSED show has no publisher on purpose, so every paused show was closed within ~10 minutes
 * (locdown, 2026-10-08). Only the 60-minute paused-show safety net may end a paused show.
 */

const hoisted = vi.hoisted(() => ({
  liveRoomFindMany: vi.fn(),
  liveRoomUpdateMany: vi.fn(),
  realtimeSend: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: {
      findMany: hoisted.liveRoomFindMany,
      updateMany: hoisted.liveRoomUpdateMany,
    },
  },
}));

vi.mock("@aws-sdk/client-ivs-realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-ivs-realtime")>();
  return {
    ...actual,
    IVSRealTimeClient: vi.fn().mockImplementation(() => ({ send: hoisted.realtimeSend })),
  };
});

vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveDiscoveryChanged: vi.fn(),
}));

import { cleanupOrphanedIvsCompositions, closeStaleOpenLiveRooms } from "@/services/ivs";

describe("cleanup sweeps never end a paused show", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VAULTED_AWS_REGION", "us-east-1");
    vi.stubEnv("VAULTED_AWS_ACCESS_KEY_ID", "test-key-id");
    vi.stubEnv("VAULTED_AWS_SECRET_ACCESS_KEY", "test-secret");
  });

  it("closeStaleOpenLiveRooms only looks at live rooms that are not paused", async () => {
    hoisted.liveRoomFindMany.mockResolvedValue([]);
    await closeStaleOpenLiveRooms();
    const where = hoisted.liveRoomFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("live");
    expect(where.streamPaused).toBe(false);
    expect(hoisted.liveRoomUpdateMany).not.toHaveBeenCalled();
  });

  it("cleanupOrphanedIvsCompositions leaves a composition alone when its live room is paused", async () => {
    const sent: string[] = [];
    hoisted.realtimeSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      sent.push(cmd.constructor.name);
      if (cmd.constructor.name === "ListCompositionsCommand") {
        return {
          compositions: [
            {
              state: "ACTIVE",
              arn: "arn:comp:1",
              stageArn: "arn:stage:1",
              startTime: new Date(Date.now() - 60 * 60_000),
            },
          ],
        };
      }
      // No active session, newest session ended an hour ago: would normally be "idle_stage" -> stop.
      if (cmd.constructor.name === "GetStageCommand") return { stage: {} };
      if (cmd.constructor.name === "ListStageSessionsCommand") {
        return { stageSessions: [{ endTime: new Date(Date.now() - 60 * 60_000) }] };
      }
      return {};
    });
    hoisted.liveRoomFindMany.mockResolvedValue([{ status: "live", endedAt: null, streamPaused: true }]);

    const summary = await cleanupOrphanedIvsCompositions();

    expect(summary.scanned).toBe(1);
    expect(summary.stopped).toBe(0);
    expect(sent).not.toContain("StopCompositionCommand");
    expect(hoisted.liveRoomUpdateMany).not.toHaveBeenCalled();
  });

  it("cleanupOrphanedIvsCompositions still stops an idle composition for a live room that is NOT paused", async () => {
    const sent: string[] = [];
    hoisted.realtimeSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      sent.push(cmd.constructor.name);
      if (cmd.constructor.name === "ListCompositionsCommand") {
        return {
          compositions: [
            {
              state: "ACTIVE",
              arn: "arn:comp:2",
              stageArn: "arn:stage:2",
              startTime: new Date(Date.now() - 60 * 60_000),
            },
          ],
        };
      }
      if (cmd.constructor.name === "GetStageCommand") return { stage: {} };
      if (cmd.constructor.name === "ListStageSessionsCommand") {
        return { stageSessions: [{ endTime: new Date(Date.now() - 60 * 60_000) }] };
      }
      return {};
    });
    hoisted.liveRoomFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      // First call: rooms referencing the composition. Later calls: stale live rooms to close.
      if ("OR" in args.where) return [{ status: "live", endedAt: null, streamPaused: false }];
      return [];
    });
    hoisted.liveRoomUpdateMany.mockResolvedValue({ count: 0 });

    const summary = await cleanupOrphanedIvsCompositions();

    expect(summary.stopped).toBe(1);
    expect(sent).toContain("StopCompositionCommand");
  });
});
