import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const scheduleNotifyAdmins = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins }));

const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/require-admin", () => ({ requireAdmin }));

const prismaMock = vi.hoisted(() => ({
  supportTicket: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, SUPPORT_OPEN_DIGEST_DEDUPE_KEY } from "@/app/api/admin/support-tickets/route";

describe("GET /api/admin/support-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ ok: true, userId: "admin_1" });
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
  });

  it("sends a one-time open-ticket digest when openCount > 0", async () => {
    prismaMock.supportTicket.count.mockResolvedValue(3);

    const res = await GET(new Request("http://localhost/api/admin/support-tickets"));
    expect(res.status).toBe(200);
    expect(scheduleNotifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_support_tickets_open_digest",
        title: "Open support tickets need attention",
        body: "3 open tickets need attention.",
        href: "/admin/support-tickets",
        dedupeKey: SUPPORT_OPEN_DIGEST_DEDUPE_KEY,
      }),
    );
  });

  it("does not send digest when there are no open tickets", async () => {
    prismaMock.supportTicket.count.mockResolvedValue(0);

    const res = await GET(new Request("http://localhost/api/admin/support-tickets"));
    expect(res.status).toBe(200);
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });

  it("returns unauthorized when not admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const res = await GET(new Request("http://localhost/api/admin/support-tickets"));
    expect(res.status).toBe(403);
    expect(scheduleNotifyAdmins).not.toHaveBeenCalled();
  });
});
