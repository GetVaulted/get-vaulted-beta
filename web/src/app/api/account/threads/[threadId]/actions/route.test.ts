import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (messaging security audit 2026-07): blocking used to only flip a per-thread
// flag, so the blocked user could dodge it by messaging via a different listing/live-room/
// profile anchor (a brand new thread). The block action must also write to the durable,
// cross-thread UserBlock table which new threads/messages are checked against.

const hoisted = vi.hoisted(() => ({
  resolveAccountUserId: vi.fn(),
  setUserBlocked: vi.fn().mockResolvedValue(undefined),
  threadFindFirst: vi.fn(),
  participantUpsert: vi.fn(),
  participantUpdate: vi.fn(),
  messageUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock("@/lib/resolve-account-auth", () => ({
  resolveAccountUserId: hoisted.resolveAccountUserId,
}));

vi.mock("@/lib/user-block", () => ({
  setUserBlocked: hoisted.setUserBlocked,
  isUserBlockError: (e: unknown) =>
    Boolean(e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    messageThread: { findFirst: hoisted.threadFindFirst },
    messageThreadParticipant: { upsert: hoisted.participantUpsert, update: hoisted.participantUpdate },
    message: { updateMany: hoisted.messageUpdateMany },
  },
}));

import { PATCH } from "@/app/api/account/threads/[threadId]/actions/route";

function ctx(threadId = "thread_1") {
  return { params: Promise.resolve({ threadId }) };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/account/threads/thread_1/actions", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/account/threads/[threadId]/actions — block writes to durable UserBlock table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.threadFindFirst.mockResolvedValue({
      id: "thread_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
    });
    hoisted.participantUpsert.mockResolvedValue({ id: "participant_1" });
    hoisted.participantUpdate.mockResolvedValue({});
  });

  it("blocking writes both the per-thread flag AND the durable cross-thread UserBlock row", async () => {
    const res = await PATCH(patchRequest({ action: "block", value: true }), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.blocked).toBe(true);
    expect(hoisted.participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { blocked: true } }),
    );
    expect(hoisted.setUserBlocked).toHaveBeenCalledWith(
      expect.anything(),
      { blockerId: "buyer_1", blockedId: "seller_1", blocked: true },
    );
  });

  it("unblocking clears both the per-thread flag AND the durable cross-thread UserBlock row", async () => {
    const res = await PATCH(patchRequest({ action: "block", value: false }), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.blocked).toBe(false);
    expect(hoisted.setUserBlocked).toHaveBeenCalledWith(
      expect.anything(),
      { blockerId: "buyer_1", blockedId: "seller_1", blocked: false },
    );
  });

  it("resolves the other party as blockedId even when the actor is the seller", async () => {
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "seller_1" });

    await PATCH(patchRequest({ action: "block", value: true }), ctx());

    expect(hoisted.setUserBlocked).toHaveBeenCalledWith(
      expect.anything(),
      { blockerId: "seller_1", blockedId: "buyer_1", blocked: true },
    );
  });
});

describe("PATCH /api/account/threads/[threadId]/actions — per-person delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.threadFindFirst.mockResolvedValue({ id: "thread_1", buyerId: "buyer_1", sellerId: "seller_1" });
    hoisted.participantUpsert.mockResolvedValue({ id: "participant_1", deletedAt: null });
    hoisted.participantUpdate.mockResolvedValue({});
  });

  it("delete only flags THIS person's participant row, and clears their unread", async () => {
    const res = await PATCH(patchRequest({ action: "delete" }), ctx());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);
    expect(new Date(json.purgeAt).getTime() - new Date(json.deletedAt).getTime()).toBe(14 * 86_400_000);
    expect(hoisted.participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "participant_1" }, data: expect.objectContaining({ purgedAt: null }) }),
    );
    expect(hoisted.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { threadId: "thread_1", recipientId: "buyer_1", readAt: null } }),
    );
  });

  it("delete with value:false restores the conversation", async () => {
    const res = await PATCH(patchRequest({ action: "delete", value: false }), ctx());
    expect((await res.json()).deleted).toBe(false);
    expect(hoisted.participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: null, purgedAt: null } }),
    );
  });

  it("purge is refused unless the conversation is already deleted", async () => {
    const res = await PATCH(patchRequest({ action: "purge" }), ctx());
    expect(res.status).toBe(400);
    expect(hoisted.participantUpdate).not.toHaveBeenCalled();
  });

  it("purge from the Deleted area removes it for good (for this person)", async () => {
    hoisted.participantUpsert.mockResolvedValue({ id: "participant_1", deletedAt: new Date() });
    const res = await PATCH(patchRequest({ action: "purge" }), ctx());
    expect(res.status).toBe(200);
    expect(hoisted.participantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { purgedAt: expect.any(Date) } }),
    );
  });
});
