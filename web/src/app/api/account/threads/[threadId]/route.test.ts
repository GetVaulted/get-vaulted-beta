import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressions covered (messaging security/perf audit 2026-07):
// 1. Muted threads must not trigger a message_received notification.
// 2. Thread messages must be paginated instead of loading the entire history unbounded.
// 3. A reply must be blocked if the sender/recipient have a cross-thread block relationship.

const hoisted = vi.hoisted(() => ({
  resolveAccountUserId: vi.fn(),
  isUserBlocked: vi.fn().mockResolvedValue(false),
  createNotification: vi.fn().mockResolvedValue("notif_1"),
  processMessageMentions: vi.fn().mockResolvedValue([]),
  loadMentionsForSources: vi.fn().mockResolvedValue(new Map()),
  threadFindFirst: vi.fn(),
  messageUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  messageFindMany: vi.fn(),
  messageCreate: vi.fn(),
  threadUpdate: vi.fn().mockResolvedValue({}),
  participantFindUnique: vi.fn(),
  userFindUnique: vi.fn().mockResolvedValue({ username: "buyer" }),
  offerFindUnique: vi.fn().mockResolvedValue(null),
  orderFindUnique: vi.fn().mockResolvedValue(null),
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

vi.mock("@/lib/mentions/load-message-mentions", () => ({
  loadMentionsForSources: hoisted.loadMentionsForSources,
}));

vi.mock("@/lib/message-threads", () => ({
  conversationKindLabel: () => "Listing",
  offerStatusChip: () => null,
  orderStatusChip: () => null,
  resolveThreadContext: vi.fn().mockResolvedValue({ headline: "Vintage Card" }),
}));

const prismaMock = vi.hoisted(() => ({
  messageThread: { findFirst: hoisted.threadFindFirst, update: hoisted.threadUpdate },
  message: {
    updateMany: hoisted.messageUpdateMany,
    findMany: hoisted.messageFindMany,
    create: hoisted.messageCreate,
  },
  messageThreadParticipant: { findUnique: hoisted.participantFindUnique },
  user: { findUnique: hoisted.userFindUnique },
  offer: { findUnique: hoisted.offerFindUnique },
  order: { findUnique: hoisted.orderFindUnique },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(prismaMock),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, POST } from "@/app/api/account/threads/[threadId]/route";

function ctx(threadId = "thread_1") {
  return { params: Promise.resolve({ threadId }) };
}

function baseThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    listingId: "listing_1",
    inbox: "primary",
    conversationKind: "buyer_seller",
    offerId: null,
    orderId: null,
    liveRoomId: null,
    listing: { id: "listing_1", title: "Vintage Card" },
    buyer: { id: "buyer_1", username: "buyer", image: null },
    seller: { id: "seller_1", username: "seller", image: null },
    participants: [],
    ...overrides,
  };
}

function makeMessages(count: number, prefix = "m") {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}_${i}`,
    senderId: i % 2 === 0 ? "buyer_1" : "seller_1",
    body: `message ${i}`,
    kind: "user",
    systemEvent: null,
    readAt: null,
    createdAt: new Date(2026, 0, 1, 0, 0, i),
  }));
}

describe("GET /api/account/threads/[threadId] — pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.threadFindFirst.mockResolvedValue(baseThread());
  });

  it("defaults to returning only the most recent 50 messages, in ascending order, with hasMore true for a long thread", async () => {
    // 60 messages exist; findMany is called desc + take(limit+1) = 51, simulate that here.
    const newestFirst51 = makeMessages(51, "recent").reverse();
    hoisted.messageFindMany.mockResolvedValue(newestFirst51);

    const res = await GET(new Request("http://localhost/api/account/threads/thread_1"), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(hoisted.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 }),
    );
    expect(json.messages).toHaveLength(50);
    expect(json.hasMore).toBe(true);
    expect(json.nextCursor).toBe(json.messages[0].id);
    // Ascending order preserved for the UI (oldest of the page first).
    expect(new Date(json.messages[0].createdAt).getTime()).toBeLessThan(
      new Date(json.messages[json.messages.length - 1].createdAt).getTime(),
    );
  });

  it("does not change behavior for a short thread (fewer messages than the page size)", async () => {
    const newestFirst5 = makeMessages(5, "short").reverse();
    hoisted.messageFindMany.mockResolvedValue(newestFirst5);

    const res = await GET(new Request("http://localhost/api/account/threads/thread_1"), ctx());
    const json = await res.json();

    expect(json.messages).toHaveLength(5);
    expect(json.hasMore).toBe(false);
    expect(json.nextCursor).toBeNull();
  });

  it("supports loading an older page via the `before` cursor", async () => {
    hoisted.messageFindMany.mockResolvedValue(makeMessages(10, "older").reverse());

    const res = await GET(
      new Request("http://localhost/api/account/threads/thread_1?before=recent_0&limit=10"),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(hoisted.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        cursor: { id: "recent_0" },
        skip: 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  // Regression (LOW, code review of same-day pagination fix): with only `createdAt desc` as the
  // sort key, messages sharing the same millisecond (e.g. a rapid system-message burst) could come
  // back in a different relative order across two paginated requests, letting "load earlier" skip
  // or duplicate one of them. `id` as a secondary sort key makes the order fully deterministic.
  it("adds `id desc` as a deterministic secondary sort key so same-millisecond messages never reorder across pages", async () => {
    const tiedTimestamp = new Date(2026, 0, 1, 0, 0, 0);
    hoisted.messageFindMany.mockResolvedValue([
      { id: "m_c", senderId: "buyer_1", body: "c", kind: "user", systemEvent: null, readAt: null, createdAt: tiedTimestamp },
      { id: "m_b", senderId: "buyer_1", body: "b", kind: "user", systemEvent: null, readAt: null, createdAt: tiedTimestamp },
      { id: "m_a", senderId: "buyer_1", body: "a", kind: "user", systemEvent: null, readAt: null, createdAt: tiedTimestamp },
    ]);

    const res = await GET(new Request("http://localhost/api/account/threads/thread_1"), ctx());

    expect(res.status).toBe(200);
    const call = hoisted.messageFindMany.mock.calls[0][0] as { orderBy: unknown };
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
});

describe("POST /api/account/threads/[threadId] — block + mute enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveAccountUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.threadFindFirst.mockResolvedValue(baseThread({ participants: [] }));
    hoisted.messageCreate.mockResolvedValue({ id: "msg_new", createdAt: new Date() });
    hoisted.participantFindUnique.mockResolvedValue(null);
  });

  function replyRequest(body: unknown) {
    return new Request("http://localhost/api/account/threads/thread_1", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("rejects a reply when a cross-thread block exists between sender and recipient", async () => {
    hoisted.isUserBlocked.mockResolvedValue(true);

    const res = await POST(replyRequest({ body: "hello" }), ctx());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBeTruthy();
    expect(hoisted.messageCreate).not.toHaveBeenCalled();
  });

  it("skips the notification when the recipient has muted the thread", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);
    hoisted.participantFindUnique.mockResolvedValue({ muted: true });

    const res = await POST(replyRequest({ body: "hello" }), ctx());

    expect(res.status).toBe(200);
    expect(hoisted.createNotification).not.toHaveBeenCalled();
  });

  it("sends the notification when the recipient has not muted the thread", async () => {
    hoisted.isUserBlocked.mockResolvedValue(false);
    hoisted.participantFindUnique.mockResolvedValue({ muted: false });

    const res = await POST(replyRequest({ body: "hello" }), ctx());

    expect(res.status).toBe(200);
    expect(hoisted.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "seller_1", type: "message_received" }),
    );
  });
});
