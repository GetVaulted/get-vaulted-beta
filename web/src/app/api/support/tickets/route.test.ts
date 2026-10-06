import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const scheduleNotifyAdmins = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins }));

const resolveAccountUserId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/resolve-account-auth", () => ({ resolveAccountUserId }));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  supportTicket: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/support/tickets/route";

describe("POST /api/support/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccountUserId.mockResolvedValue({ userId: "user_1" });
    prismaMock.user.findUnique.mockResolvedValue({ email: "u@example.com", username: "collector1" });
    prismaMock.supportTicket.create.mockResolvedValue({
      id: "tix_1",
      userId: "user_1",
      category: "shipping",
      subject: "Label stuck",
      message: "Need help with a label",
      contactEmail: "u@example.com",
      referenceType: null,
      referenceId: null,
      status: "submitted",
      adminNotes: "",
      assignedAdminId: null,
      resolvedAt: null,
      createdAt: new Date("2026-07-26T12:00:00.000Z"),
      updatedAt: new Date("2026-07-26T12:00:00.000Z"),
      user: { username: "collector1" },
      assignedAdmin: null,
    });
  });

  it("notifies admins after creating a ticket", async () => {
    const res = await POST(
      new Request("http://localhost/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "shipping",
          subject: "Label stuck",
          message: "Need help with a label",
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(scheduleNotifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_support_ticket",
        title: "New support ticket",
        href: "/admin/support-tickets?status=submitted",
        dedupeKey: "support-ticket:tix_1",
      }),
    );
    const call = scheduleNotifyAdmins.mock.calls[0][0] as { body: string };
    expect(call.body).toContain("@collector1");
    expect(call.body).toContain("Label stuck");
  });

  it("does not notify when auth fails", async () => {
    resolveAccountUserId.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const res = await POST(
      new Request("http://localhost/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "shipping", message: "hi" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });
});
