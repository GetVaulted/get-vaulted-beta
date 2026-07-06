import { beforeEach, describe, expect, it, vi } from "vitest";

const emitUserNotificationCreated = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime-emit-server", () => ({ emitUserNotificationCreated }));

const sendExpoPushBroadcast = vi.hoisted(() => vi.fn().mockResolvedValue(3));
vi.mock("@/lib/push/send-expo-push", () => ({ sendExpoPushBroadcast }));

const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  notificationBroadcast: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { sendMassNotification } from "@/lib/admin/send-mass-notification";

describe("sendMassNotification — idempotency guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([{ id: "user_1" }, { id: "user_2" }]);
    sendExpoPushBroadcast.mockResolvedValue(2);
  });

  it("sends normally and records the broadcast when no idempotency key is given", async () => {
    prismaMock.notificationBroadcast.create.mockResolvedValue({ id: "bcast_1" });

    const result = await sendMassNotification({
      title: "Sale tonight",
      body: "Doors open at 8pm",
      createdByUserId: "admin_1",
    });

    expect(result).toEqual({ broadcastId: "bcast_1", recipientCount: 2, pushSentCount: 2 });
    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
    expect(sendExpoPushBroadcast).toHaveBeenCalledTimes(1);
  });

  it("reserves a broadcast row with the idempotency key before sending, then finalizes it", async () => {
    prismaMock.notificationBroadcast.create.mockResolvedValue({ id: "bcast_reserved" });
    prismaMock.notificationBroadcast.update.mockResolvedValue({ id: "bcast_reserved" });

    const result = await sendMassNotification({
      title: "Sale tonight",
      body: "Doors open at 8pm",
      createdByUserId: "admin_1",
      idempotencyKey: "key-abc",
    });

    expect(prismaMock.notificationBroadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-abc", recipientCount: 0 }) }),
    );
    expect(prismaMock.notificationBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bcast_reserved" },
        data: expect.objectContaining({ recipientCount: 2, pushSentCount: 2, completedAt: expect.any(Date) }),
      }),
    );
    expect(result).toEqual({ broadcastId: "bcast_reserved", recipientCount: 2, pushSentCount: 2 });
  });

  it("replays the original result instead of sending again when the idempotency key was already used and the original send completed", async () => {
    prismaMock.notificationBroadcast.create.mockRejectedValue({ code: "P2002" });
    prismaMock.notificationBroadcast.findUnique.mockResolvedValue({
      id: "bcast_original",
      recipientCount: 500,
      pushSentCount: 480,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    const result = await sendMassNotification({
      title: "Sale tonight",
      body: "Doors open at 8pm",
      createdByUserId: "admin_1",
      idempotencyKey: "key-abc",
    });

    expect(result).toEqual({
      broadcastId: "bcast_original",
      recipientCount: 500,
      pushSentCount: 480,
      replayed: true,
    });
    // Must not fan out notifications/pushes a second time.
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(sendExpoPushBroadcast).not.toHaveBeenCalled();
  });

  // Regression (HIGH, code review of same-day idempotency fix): a crashed partial send (placeholder
  // row reserved, but the process died before fan-out finished) must NOT be treated as a completed
  // replay forever — it must be safe to retry once the original attempt is clearly abandoned.
  it("re-attempts the fan-out (does not replay) when a prior reservation never completed and is stale", async () => {
    prismaMock.notificationBroadcast.create.mockRejectedValue({ code: "P2002" });
    prismaMock.notificationBroadcast.findUnique.mockResolvedValue({
      id: "bcast_crashed",
      recipientCount: 0,
      pushSentCount: 0,
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // reserved 10 minutes ago — well past stale threshold
      completedAt: null,
    });
    prismaMock.notificationBroadcast.update.mockResolvedValue({ id: "bcast_crashed" });

    const result = await sendMassNotification({
      title: "Sale tonight",
      body: "Doors open at 8pm",
      createdByUserId: "admin_1",
      idempotencyKey: "key-crashed",
    });

    // The fan-out actually ran this time, against the same (reused) broadcast row.
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
    expect(sendExpoPushBroadcast).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bcast_crashed" },
        data: expect.objectContaining({ recipientCount: 2, pushSentCount: 2, completedAt: expect.any(Date) }),
      }),
    );
    expect(result).toEqual({ broadcastId: "bcast_crashed", recipientCount: 2, pushSentCount: 2 });
  });

  it("rejects (does not replay or re-send) when a prior reservation is incomplete but still very recent", async () => {
    prismaMock.notificationBroadcast.create.mockRejectedValue({ code: "P2002" });
    prismaMock.notificationBroadcast.findUnique.mockResolvedValue({
      id: "bcast_inflight",
      recipientCount: 0,
      pushSentCount: 0,
      createdAt: new Date(), // reserved just now — still very likely actively sending
      completedAt: null,
    });

    await expect(
      sendMassNotification({
        title: "Sale tonight",
        body: "Doors open at 8pm",
        createdByUserId: "admin_1",
        idempotencyKey: "key-inflight",
      }),
    ).rejects.toThrow();

    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(sendExpoPushBroadcast).not.toHaveBeenCalled();
    expect(prismaMock.notificationBroadcast.update).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    await expect(
      sendMassNotification({ title: "", body: "Doors open at 8pm", createdByUserId: "admin_1" }),
    ).rejects.toThrow();
    expect(prismaMock.notificationBroadcast.create).not.toHaveBeenCalled();
  });
});
