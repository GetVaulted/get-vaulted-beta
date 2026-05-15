import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  applyRecordedIvsStreamState: vi.fn(),
  findLiveRoomIdByIvsChannelArn: vi.fn(),
  checkRateLimit: vi.fn(
    (): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterMs: number } => ({
      ok: true,
      remaining: 100,
      resetAt: Date.now() + 60_000,
    }),
  ),
}));

vi.mock("@/lib/request-rate-limit", () => ({
  checkRateLimit: hoisted.checkRateLimit,
}));

vi.mock("@/lib/ivs-ops-log", () => ({
  logIvsOpsServer: vi.fn(),
}));

vi.mock("@/services/ivs", () => ({
  applyRecordedIvsStreamState: hoisted.applyRecordedIvsStreamState,
  findLiveRoomIdByIvsChannelArn: hoisted.findLiveRoomIdByIvsChannelArn,
}));

import { POST } from "@/app/api/aws/ivs/events/route";

describe("POST /api/aws/ivs/events", () => {
  let prevSecret: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    prevSecret = process.env.IVS_EVENTS_WEBHOOK_SECRET;
    process.env.IVS_EVENTS_WEBHOOK_SECRET = "test-webhook-secret";
    hoisted.checkRateLimit.mockReturnValue({ ok: true, remaining: 100, resetAt: Date.now() + 60_000 });
    hoisted.findLiveRoomIdByIvsChannelArn.mockResolvedValue("room_ivs_1");
    hoisted.applyRecordedIvsStreamState.mockResolvedValue({
      kind: "updated",
      previousHealth: "live",
      newHealth: "offline",
      roomVersion: 9,
    });
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.IVS_EVENTS_WEBHOOK_SECRET;
    else process.env.IVS_EVENTS_WEBHOOK_SECRET = prevSecret;
  });

  it("returns 503 when IVS_EVENTS_WEBHOOK_SECRET is unset", async () => {
    delete process.env.IVS_EVENTS_WEBHOOK_SECRET;
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
        body: JSON.stringify({ detail: { channelArn: "arn:aws:ivs:us-east-1:1:channel/x", state: "OFFLINE" } }),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 without valid secret", async () => {
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
        body: JSON.stringify({ detail: { channelArn: "arn:aws:ivs:us-east-1:1:channel/x", state: "OFFLINE" } }),
      }),
    );
    expect(res.status).toBe(401);
    expect(hoisted.applyRecordedIvsStreamState).not.toHaveBeenCalled();
  });

  it("accepts Bearer secret and EventBridge-style detail", async () => {
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook-secret" },
        body: JSON.stringify({
          version: "0",
          id: "evt-1",
          "detail-type": "IVS Stream State Change",
          source: "aws.ivs",
          detail: {
            channelArn: "arn:aws:ivs:us-east-1:123456789012:channel/abcd",
            state: "LIVE",
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; roomId?: string; updated?: boolean };
    expect(body.ok).toBe(true);
    expect(body.roomId).toBe("room_ivs_1");
    expect(body.updated).toBe(true);
    expect(hoisted.applyRecordedIvsStreamState).toHaveBeenCalledWith("room_ivs_1", "LIVE");
  });

  it("accepts X-IVS-Events-Secret header", async () => {
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { "X-IVS-Events-Secret": "test-webhook-secret" },
        body: JSON.stringify({ channelArn: "arn:aws:ivs:us-east-1:1:channel/z", streamState: "ENDED" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(hoisted.applyRecordedIvsStreamState).toHaveBeenCalledWith("room_ivs_1", "ENDED");
  });

  it("returns ok ignored when channel does not map to a room", async () => {
    hoisted.findLiveRoomIdByIvsChannelArn.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook-secret" },
        body: JSON.stringify({ detail: { channelArn: "arn:aws:ivs:us-east-1:1:channel/unknown", state: "OFFLINE" } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ignored?: boolean };
    expect(body.ignored).toBe(true);
    expect(hoisted.applyRecordedIvsStreamState).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    hoisted.checkRateLimit.mockReturnValueOnce({ ok: false as const, retryAfterMs: 5000 });
    const res = await POST(
      new Request("http://localhost/api/aws/ivs/events", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook-secret" },
        body: JSON.stringify({ detail: { channelArn: "arn:aws:ivs:us-east-1:1:channel/x", state: "OFFLINE" } }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
