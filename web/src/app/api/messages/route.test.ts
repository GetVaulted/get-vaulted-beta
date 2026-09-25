import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (messaging security audit 2026-07): a blocked user could bypass the block by
// starting a brand NEW thread via a different listing/live/profile "message seller" entry
// point, since POST /api/messages never checked block status at all.

const hoisted = vi.hoisted(() => ({
  resolveAccountUserId: vi.fn(),
  isUserBlocked: vi.fn(),
  createNotification: vi.fn().mockResolvedValue("notif_1"),
  processMessageMentions: vi.fn().mockResolvedValue([]),
  ensureThreadParticipants: vi.fn().mockResolvedValue(undefined),
  resolveInboxForNewThread: vi.fn().mockResolvedValue("primary"),
  listingFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  threadUpsert: vi.fn(),
  threadUpdate: vi.fn(),
  messageCreate: vi.fn(),
  participantFindUnique: vi.fn(),
}));

vi.mock("@/lib/resolve-account-auth", () => ({
  resolveAccountUserId: hoisted.resolveAccountUserId,
}));

vi.mock("@/lib/user-block", () => ({
  isUserBlocked: hoisted.isUserBlocked,
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: hoisted.createNotification,
}));

vi.mock("@/lib/mentions/process-message-mentions", () => ({
  processMessageMentions: hoisted.processMessageMentions,
}));

vi.mock("@/lib/message-threads", () => ({
  ensureThreadParticipants: hoisted.ensureThreadParticipants,
  listingAnchorKey: (id: string) => `listing:${id}`,
  liveAnchorKey: (id: string) => `live:${id}`,
  profileAnchorKey: (id: string) => `profile:${id}`,
  resolveInboxForNewThread: hoisted.resolveInboxForNewThread,
  resolveLiveNetworkingListingAnchor: vi.fn(),
  resolveProfileMessagingListingAnchor: vi.fn(),
}));

const txMock = {
  messageThread: { upsert: hoisted.threadUpsert, update: hoisted.threadUpdate },
  message: { create: hoisted.messageCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: hoisted.userFindUnique },
    listing: { findUnique: hoisted.listingFindUnique },
    liveRoom: { findUnique: vi.fn() },
    messageThreadParticipant: { findUnique: hoisted.participantFindUnique },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(txMock),
  },
}));

import { POST } from "@/app/api/messages/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/messages — cross-thread block enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.listingFindUnique.mockResolvedValue({
      id: "listing_1",
      title: "Vintage Card",
      sellerId: "seller_1",
      status: "active",
      moderationRemovedAt: null,
    });
    hoisted.userFindUnique.mockResolvedValue({ id: "buyer_1", username: "buyer" });
    hoisted.threadUpsert.mockResolvedValue({ id: "thread_new", inbox: "primary" });
    hoisted.messageCreate.mockResolvedValue({ id: "msg_1" });
    hoisted.threadUpdate.mockResolvedValue({});
    hoisted.participantFindUnique.mockResolvedValue(null);
    hoisted.resolveInboxForNewThread.mockResolvedValue("primary");
  });

  it("rejects starting a NEW thread with a user who has an existing cross-thread block", async () => {
    hoisted.isUserBlocked.mockResolvedValue(true);

    const res = await POST(buildRequest({ listingId: "listing_1", body: "Hey, is this still available?" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/cannot message/i);
    expect(hoisted.isUserBlocked).toHaveBeenCalledWith(expect.anything(), "buyer_1", "seller_1");
    expect(hoisted.threadUpsert).not.toHaveBeenCalled();
    expect(hoisted.messageCreate).not.toHaveBeenCalled();
  });

  it("allows sending when there is no block between the two users", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);

    const res = await POST(buildRequest({ listingId: "listing_1", body: "Hey, is this still available?" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.threadId).toBe("thread_new");
    expect(hoisted.messageCreate).toHaveBeenCalledTimes(1);
  });

  it("skips the message_received notification when the recipient has muted the thread", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);
    hoisted.participantFindUnique.mockResolvedValue({ muted: true });

    const res = await POST(buildRequest({ listingId: "listing_1", body: "Still available?" }));

    expect(res.status).toBe(200);
    expect(hoisted.createNotification).not.toHaveBeenCalled();
  });

  it("sends the message_received notification when the recipient has NOT muted the thread", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);
    hoisted.participantFindUnique.mockResolvedValue({ muted: false });

    const res = await POST(buildRequest({ listingId: "listing_1", body: "Still available?" }));

    expect(res.status).toBe(200);
    expect(hoisted.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "seller_1",
        type: "message_received",
        title: "Received a Message",
      }),
    );
  });

  it("notifies with 'Message Requested' when the thread lands in the request folder", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);
    hoisted.participantFindUnique.mockResolvedValue({ muted: false });
    // A cold contact (no mutual follow / prior trust) upserts a request-folder thread.
    hoisted.resolveInboxForNewThread.mockResolvedValue("request");
    hoisted.threadUpsert.mockResolvedValue({ id: "thread_req", inbox: "request" });

    const res = await POST(buildRequest({ listingId: "listing_1", body: "Hi!" }));

    expect(res.status).toBe(200);
    expect(hoisted.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "seller_1",
        type: "message_requested",
        title: "Message Requested",
      }),
    );
  });
});
