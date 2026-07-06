import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServerSessionSafe: vi.fn(),
  getLiveRoomHostAccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {}, getServerSessionSafe: hoisted.getServerSessionSafe }));
vi.mock("@/lib/live-room-host-auth", () => ({
  getLiveRoomHostAccess: hoisted.getLiveRoomHostAccess,
  parseTeamLabelsJson: (raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  },
}));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitBreakSpotsChanged: vi.fn(),
  emitLiveRoomMessageById: vi.fn(),
  emitVaultRevealSpin: vi.fn(),
}));
vi.mock("@/lib/vault-reveal-spin", () => ({ VAULT_REVEAL_DEFAULT_DURATION_MS: 4000 }));

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  liveRoomItem: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  liveRoomMessage: {
    create: vi.fn().mockResolvedValue({ id: "msg_1" }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/live-rooms/[id]/randomize/route";

function baseRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room_1",
    sellerId: "seller_1",
    breakFormat: "team_break",
    breakTeamLabelsJson: JSON.stringify(["AFC East", "AFC North", "AFC South", "AFC West"]),
    assignmentsLockedAt: null,
    randomizationPreviewJson: null,
    randomizationSeed: null,
    randomizationResultJson: null,
    randomizedAt: null,
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown>) {
  return new Request("http://x/api/live-rooms/room_1/randomize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: "room_1" }) };
}

describe("randomize route — FIX 7 commit-then-reveal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getServerSessionSafe.mockResolvedValue({ user: { id: "seller_1" } });
    hoisted.getLiveRoomHostAccess.mockImplementation(async () => ({
      ok: true,
      room: baseRoom(),
      isAdmin: false,
    }));
    prismaMock.liveRoom.update.mockResolvedValue(undefined);
  });

  it("commits a random draw on the first preview call", async () => {
    let stored: Record<string, unknown> | null = null;
    prismaMock.liveRoom.findUnique.mockImplementation(async () => baseRoom({ randomizationPreviewJson: stored ? JSON.stringify(stored) : null }));
    prismaMock.liveRoom.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = JSON.parse(data.randomizationPreviewJson as string);
      return undefined;
    });

    const res = await POST(postRequest({ mode: "preview" }), params());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preview: { seed: string; assignments: unknown[] } };
    expect(body.preview.seed).toBeTruthy();
    expect(body.preview.assignments).toHaveLength(4);
  });

  it("returns the IDENTICAL committed result on a second preview call for the same round, instead of re-rolling", async () => {
    let stored: Record<string, unknown> | null = null;
    hoisted.getLiveRoomHostAccess.mockImplementation(async () => ({
      ok: true,
      room: baseRoom({ randomizationPreviewJson: stored ? JSON.stringify(stored) : null }),
      isAdmin: false,
    }));
    prismaMock.liveRoom.findUnique.mockImplementation(async () => baseRoom({ randomizationPreviewJson: stored ? JSON.stringify(stored) : null }));
    prismaMock.liveRoom.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = JSON.parse(data.randomizationPreviewJson as string);
      return undefined;
    });

    const first = await POST(postRequest({ mode: "preview" }), params());
    const firstBody = (await first.json()) as { preview: { seed: string; assignments: { order: number; label: string }[] } };

    const second = await POST(postRequest({ mode: "preview" }), params());
    const secondBody = (await second.json()) as { preview: { seed: string; assignments: { order: number; label: string }[] } };

    expect(secondBody.preview.seed).toBe(firstBody.preview.seed);
    expect(secondBody.preview.assignments).toEqual(firstBody.preview.assignments);
    // Only the FIRST preview call should have written to the DB — the second is a pure read of the
    // already-committed round.
    expect(prismaMock.liveRoom.update).toHaveBeenCalledTimes(1);
  });

  it("commits a fresh draw when the label set genuinely changes (a new round)", async () => {
    const committed = {
      seed: "old-seed",
      assignments: [{ order: 1, label: "AFC East" }],
      format: "team_break",
      createdAt: new Date().toISOString(),
      labelsKey: JSON.stringify(["Old Label"]),
    };
    hoisted.getLiveRoomHostAccess.mockResolvedValue({
      ok: true,
      room: baseRoom({ randomizationPreviewJson: JSON.stringify(committed) }),
      isAdmin: false,
    });
    prismaMock.liveRoom.findUnique.mockResolvedValue(
      baseRoom({ randomizationPreviewJson: JSON.stringify(committed) }),
    );

    const res = await POST(postRequest({ mode: "preview" }), params());
    const body = (await res.json()) as { preview: { seed: string } };

    expect(body.preview.seed).not.toBe("old-seed");
    expect(prismaMock.liveRoom.update).toHaveBeenCalledTimes(1);
  });

  it("confirm finalizes the already-committed preview result verbatim", async () => {
    const committed = {
      seed: "committed-seed",
      assignments: [
        { order: 1, label: "AFC West" },
        { order: 2, label: "AFC East" },
      ],
      format: "team_break",
      createdAt: new Date().toISOString(),
      labelsKey: JSON.stringify(["AFC East", "AFC North", "AFC South", "AFC West"]),
    };
    hoisted.getLiveRoomHostAccess.mockResolvedValue({
      ok: true,
      room: baseRoom({
        randomizationPreviewJson: JSON.stringify(committed),
        randomizationSeed: committed.seed,
      }),
      isAdmin: false,
    });
    prismaMock.liveRoom.findUnique.mockResolvedValue(
      baseRoom({
        randomizationPreviewJson: JSON.stringify(committed),
        randomizationSeed: committed.seed,
      }),
    );

    const res = await POST(postRequest({ mode: "confirm" }), params());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { seed: string } };
    expect(body.result.seed).toBe("committed-seed");
    expect(prismaMock.liveRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ randomizationSeed: "committed-seed" }),
      }),
    );
  });

  it("FIX 5: rejects confirm when the host edited team labels after preview but before confirm", async () => {
    // Preview was committed against the ORIGINAL 4-label set.
    const committed = {
      seed: "committed-seed",
      assignments: [
        { order: 1, label: "AFC West" },
        { order: 2, label: "AFC East" },
      ],
      format: "team_break",
      createdAt: new Date().toISOString(),
      labelsKey: JSON.stringify(["AFC East", "AFC North", "AFC South", "AFC West"]),
    };
    // Current room labels have since changed (host edited them before confirming).
    const roomWithEditedLabels = baseRoom({
      randomizationPreviewJson: JSON.stringify(committed),
      randomizationSeed: committed.seed,
      breakTeamLabelsJson: JSON.stringify(["AFC East", "AFC North", "AFC South", "AFC WEST (renamed)"]),
    });
    hoisted.getLiveRoomHostAccess.mockResolvedValue({
      ok: true,
      room: roomWithEditedLabels,
      isAdmin: false,
    });
    prismaMock.liveRoom.findUnique.mockResolvedValue(roomWithEditedLabels);

    const res = await POST(postRequest({ mode: "confirm" }), params());

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/labels have changed/i);
    expect(prismaMock.liveRoom.update).not.toHaveBeenCalled();
  });

  it("FIX 5: confirm still succeeds when labels are unchanged since preview", async () => {
    const committed = {
      seed: "committed-seed-2",
      assignments: [{ order: 1, label: "AFC East" }],
      format: "team_break",
      createdAt: new Date().toISOString(),
      labelsKey: JSON.stringify(["AFC East", "AFC North", "AFC South", "AFC West"]),
    };
    const room = baseRoom({
      randomizationPreviewJson: JSON.stringify(committed),
      randomizationSeed: committed.seed,
    });
    hoisted.getLiveRoomHostAccess.mockResolvedValue({ ok: true, room, isAdmin: false });
    prismaMock.liveRoom.findUnique.mockResolvedValue(room);

    const res = await POST(postRequest({ mode: "confirm" }), params());

    expect(res.status).toBe(200);
    expect(prismaMock.liveRoom.update).toHaveBeenCalledTimes(1);
  });
});
