import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }),
}));

const logTrustModerationAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/trust/moderation-audit-log", () => ({ logTrustModerationAction }));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitAuctionEnded: vi.fn(),
  emitLiveDiscoveryChanged: vi.fn(),
}));
vi.mock("@/lib/trust/live-replay-service", () => ({
  finalizeLiveStreamReplay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/ivs", () => ({
  endHostStageSession: vi.fn().mockResolvedValue(undefined),
  ensureStageHlsCompositionActive: vi.fn().mockResolvedValue(undefined),
}));

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  report: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/admin/live-shows/[id]/actions/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/admin/live-shows/room_1/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/live-shows/[id]/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });
  });

  it("writes an audit log entry and preserves final GMV when ending a live show", async () => {
    prismaMock.liveRoom.findUnique
      .mockResolvedValueOnce({ id: "room_1", status: "live", sellerId: "seller_1", title: "Show", completedSalesGmvUsd: 3200 })
      .mockResolvedValueOnce({ roomVersion: 2 });

    const res = await POST(buildRequest({ action: "end", note: "tech issue" }), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.liveRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedSalesGmvUsd: 0, finalSalesGmvUsd: 3200 }),
      }),
    );
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "admin_live_show_ended",
        targetType: "live_room",
        targetId: "room_1",
        detail: expect.objectContaining({ note: "tech issue" }),
      }),
    );
  });

  it("writes an audit log entry and preserves final GMV when cancelling a live show", async () => {
    prismaMock.liveRoom.findUnique
      .mockResolvedValueOnce({ id: "room_1", status: "scheduled", sellerId: "seller_1", title: "Show", completedSalesGmvUsd: 0 })
      .mockResolvedValueOnce({ roomVersion: 2 });

    const res = await POST(buildRequest({ action: "cancel" }), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "admin_1", action: "admin_live_show_cancelled", targetType: "live_room", targetId: "room_1" }),
    );
  });

  it("does not write an audit log entry for the flag action", async () => {
    prismaMock.liveRoom.findUnique.mockResolvedValueOnce({
      id: "room_1",
      status: "live",
      sellerId: "seller_1",
      title: "Show",
      completedSalesGmvUsd: 0,
    });
    prismaMock.report.findFirst.mockResolvedValue(null);
    prismaMock.report.create.mockResolvedValue({ id: "report_1" });

    const res = await POST(buildRequest({ action: "flag" }), {
      params: Promise.resolve({ id: "room_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).not.toHaveBeenCalled();
  });
});
