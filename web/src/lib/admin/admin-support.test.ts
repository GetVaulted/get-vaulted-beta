import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  adminNote: { create: vi.fn(), findMany: vi.fn() },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notify = vi.hoisted(() => ({ createNotification: vi.fn() }));
vi.mock("@/lib/notifications", () => notify);

import { addAdminNote, safeInternalHref, sendAdminMessage } from "./admin-support";

beforeEach(() => vi.clearAllMocks());

describe("safeInternalHref", () => {
  it("keeps in-app paths and rejects off-site or odd links", () => {
    expect(safeInternalHref("/orders/abc")).toBe("/orders/abc");
    for (const bad of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/a\\b", 42, undefined]) {
      expect(safeInternalHref(bad)).toBe("/account/notifications");
    }
  });
});

describe("sendAdminMessage", () => {
  it("needs a title and a body", async () => {
    await expect(sendAdminMessage({ adminUserId: "a", userId: "u", title: " ", body: "x", reason: "follow up" })).rejects.toMatchObject({
      code: "TITLE_AND_BODY_REQUIRED",
    });
    expect(notify.createNotification).not.toHaveBeenCalled();
  });
  it("sends an admin_message with a safe link and logs it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u", suspendedAt: null });
    notify.createNotification.mockResolvedValue("n1");
    await sendAdminMessage({ adminUserId: "a", userId: "u", title: "Your refund", body: "It is on the way.", href: "https://evil.com", reason: "refund follow up" });
    expect(notify.createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ userId: "u", type: "admin_message", href: "/account/notifications" }),
    );
    expect(prismaMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "support.message_user", targetUserId: "u" }) }),
    );
  });
  it("fails loudly (and logs nothing) when the notification could not be created", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u", suspendedAt: null });
    notify.createNotification.mockResolvedValue(null);
    await expect(sendAdminMessage({ adminUserId: "a", userId: "u", title: "t", body: "b", reason: "follow up" })).rejects.toMatchObject({ code: "SEND_FAILED" });
    expect(prismaMock.adminActionLog.create).not.toHaveBeenCalled();
  });
  it("404s an unknown user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(sendAdminMessage({ adminUserId: "a", userId: "nope", title: "t", body: "b", reason: "follow up" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("addAdminNote", () => {
  it("rejects unknown targets and empty notes", async () => {
    await expect(addAdminNote({ adminUserId: "a", targetType: "secrets", targetId: "x", body: "hello" })).rejects.toMatchObject({ code: "BAD_TARGET" });
    await expect(addAdminNote({ adminUserId: "a", targetType: "user", targetId: "x", body: " " })).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    expect(prismaMock.adminNote.create).not.toHaveBeenCalled();
  });
  it("stores a trimmed note", async () => {
    prismaMock.adminNote.create.mockResolvedValue({ id: "n1" });
    await addAdminNote({ adminUserId: "a", targetType: "order", targetId: "o1", body: "  called buyer  " });
    expect(prismaMock.adminNote.create).toHaveBeenCalledWith({
      data: { targetType: "order", targetId: "o1", authorId: "a", body: "called buyer" },
    });
  });
});
