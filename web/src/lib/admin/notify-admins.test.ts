import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  webhookEventLog: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

const createNotification = vi.hoisted(() => vi.fn());
const sendResendEmail = vi.hoisted(() => vi.fn());
const isResendEmailConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/resend-email", () => ({
  isResendEmailConfigured,
  sendResendEmail,
}));

import { notifyAdmins } from "@/lib/admin/notify-admins";

describe("notifyAdmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.webhookEventLog.findFirst.mockResolvedValue(null);
    prismaMock.webhookEventLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "admin1", email: "admin@shopgetvaulted.com" },
    ]);
    createNotification.mockResolvedValue("n1");
    sendResendEmail.mockResolvedValue({ ok: true });
    isResendEmailConfigured.mockReturnValue(true);
  });

  it("creates in-app notification and emails each admin", async () => {
    const result = await notifyAdmins({
      type: "admin_new_user",
      title: "New account",
      body: "@buyer signed up",
      href: "/admin/users",
      dedupeKey: "new-user:u1",
    });

    expect(result).toEqual({ notified: 1, skipped: false });
    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        userId: "admin1",
        type: "admin_new_user",
        title: "New account",
      }),
    );
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@shopgetvaulted.com",
        subject: "New account",
      }),
    );
  });

  it("skips when dedupe key already processed", async () => {
    prismaMock.webhookEventLog.findFirst.mockResolvedValue({ id: "existing" });

    const result = await notifyAdmins({
      type: "admin_seller_onboarded",
      title: "Seller onboarded",
      body: "@seller finished",
      href: "/admin/users",
      dedupeKey: "seller-onboard:u1",
    });

    expect(result).toEqual({ notified: 0, skipped: true });
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
