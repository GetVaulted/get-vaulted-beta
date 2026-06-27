import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    listing: { findUnique: vi.fn() },
    liveRoom: { findUnique: vi.fn() },
    liveRoomMessage: { findUnique: vi.fn() },
    order: { findUnique: vi.fn() },
    breakSpot: { findUnique: vi.fn() },
    report: { create: vi.fn() },
  },
}));

vi.mock("@/lib/trust/moderation-audit-log", () => ({
  logReportAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomModerationChanged: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { emitLiveRoomModerationChanged } from "@/lib/realtime-emit-server";
import { createReport } from "@/lib/trust/report-service";

describe("createReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.liveRoom.findUnique).mockResolvedValue({ id: "room-1" } as never);
    vi.mocked(prisma.report.create).mockResolvedValue({ id: "report-1" } as never);
  });

  it("notifies live room moderators when a show report is filed", async () => {
    await createReport({
      reporterUserId: "user-1",
      targetType: "live_room",
      targetId: "room-1",
      reason: "spam",
      description: "Test",
      liveRoomId: "room-1",
    });

    expect(emitLiveRoomModerationChanged).toHaveBeenCalledWith("room-1");
  });

  it("derives liveRoomId from message targets", async () => {
    vi.mocked(prisma.liveRoomMessage.findUnique).mockResolvedValue({
      id: "msg-1",
      liveRoomId: "room-2",
    } as never);

    await createReport({
      reporterUserId: "user-1",
      targetType: "message",
      targetId: "msg-1",
      reason: "harassment",
    });

    expect(emitLiveRoomModerationChanged).toHaveBeenCalledWith("room-2");
  });
});
