import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true, userId: "admin_1" }),
}));

const logTrustModerationAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/trust/moderation-audit-log", () => ({ logTrustModerationAction }));

const prismaMock = vi.hoisted(() => ({
  listing: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH } from "@/app/api/admin/listings/[id]/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/admin/listings/listing_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/listings/[id] — audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.listing.findUnique.mockResolvedValue({ id: "listing_1" });
  });

  it("writes an audit log entry when removing a listing", async () => {
    const res = await PATCH(buildRequest({ action: "remove", reason: "counterfeit" }), {
      params: Promise.resolve({ id: "listing_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "admin_listing_removed",
        targetType: "listing",
        targetId: "listing_1",
        detail: expect.objectContaining({ reason: "counterfeit" }),
      }),
    );
  });

  it("writes an audit log entry when restoring a listing", async () => {
    const res = await PATCH(buildRequest({ action: "restore" }), {
      params: Promise.resolve({ id: "listing_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "admin_1", action: "admin_listing_restored", targetType: "listing", targetId: "listing_1" }),
    );
  });

  it("writes an audit log entry when marking a listing reviewed", async () => {
    const res = await PATCH(buildRequest({ action: "mark_reviewed" }), {
      params: Promise.resolve({ id: "listing_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "admin_1", action: "admin_listing_marked_reviewed", targetType: "listing", targetId: "listing_1" }),
    );
  });

  it("does not write an audit log entry for a plain isCompanyListing toggle with no action", async () => {
    const res = await PATCH(buildRequest({ isCompanyListing: true }), {
      params: Promise.resolve({ id: "listing_1" }),
    });

    expect(res.status).toBe(200);
    expect(logTrustModerationAction).not.toHaveBeenCalled();
  });
});
