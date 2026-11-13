import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireHostAccess: vi.fn(),
  requireSellerTermsToStart: vi.fn(),
  getStreamRow: vi.fn(),
  resolveHostPublisher: vi.fn(),
  prepareAgoraHostSession: vi.fn(),
  refreshAgoraHostSession: vi.fn(),
  endAgoraHostSession: vi.fn(),
  confirmAgoraHostLive: vi.fn(),
  createAgoraViewerSession: vi.fn(),
  isAgoraConfigured: vi.fn(),
  getAgoraConfig: vi.fn(),
}));

vi.mock("../_shared", () => ({
  requireHostAccess: hoisted.requireHostAccess,
  requireSellerTermsToStart: hoisted.requireSellerTermsToStart,
  getStreamRow: hoisted.getStreamRow,
  toHostStreamPayload: (row: Record<string, unknown>) => ({ roomId: row.id, phoneRelay: true }),
  errorResponse: (e: unknown) =>
    NextResponse.json({ error: e instanceof Error ? e.message : "x" }, { status: 500 }),
}));
vi.mock("@/services/agora-room", () => ({
  resolveHostPublisher: hoisted.resolveHostPublisher,
  prepareAgoraHostSession: hoisted.prepareAgoraHostSession,
  refreshAgoraHostSession: hoisted.refreshAgoraHostSession,
  endAgoraHostSession: hoisted.endAgoraHostSession,
  confirmAgoraHostLive: hoisted.confirmAgoraHostLive,
}));
vi.mock("@/services/agora-rtc", () => ({
  getAgoraConfig: hoisted.getAgoraConfig,
  isAgoraConfigured: hoisted.isAgoraConfigured,
  createAgoraViewerSession: hoisted.createAgoraViewerSession,
}));
vi.mock("@/lib/ip-capture", () => ({ extractClientIp: () => "1.2.3.4" }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitStreamStatusChanged: vi.fn() }));
vi.mock("@/lib/ivs-ops-log", () => ({ logIvsOpsServer: vi.fn() }));

import { GET as getPublisher } from "../publisher/route";
import { DELETE as deleteSession, PATCH as patchSession, POST as postSession } from "./route";
import { POST as postLive } from "../live/route";
import { GET as getViewer } from "../agora-viewer/route";

const ctx = { params: Promise.resolve({ id: "room_1" }) };
const req = (method: string) => new Request("http://x", { method, body: method === "GET" ? undefined : "{}" });
const SESSION = { appId: "app", channel: "gv-room_1", uid: 7, token: "tok", expiresInSeconds: 43200 };
const ROW = { id: "room_1", streamHealth: "offline", lastIvsStatusSyncAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.requireHostAccess.mockResolvedValue({ ok: true, userId: "u1", access: { isAdmin: false } });
  hoisted.requireSellerTermsToStart.mockResolvedValue(null);
  hoisted.getStreamRow.mockResolvedValue(ROW);
  hoisted.resolveHostPublisher.mockResolvedValue("agora");
  hoisted.getAgoraConfig.mockReturnValue({ appId: "app", appCertificate: "SECRET-CERT" });
  hoisted.prepareAgoraHostSession.mockResolvedValue(SESSION);
  hoisted.refreshAgoraHostSession.mockReturnValue(SESSION);
  hoisted.confirmAgoraHostLive.mockResolvedValue(true);
  hoisted.isAgoraConfigured.mockReturnValue(true);
  hoisted.createAgoraViewerSession.mockReturnValue({ appId: "app", channel: "gv-room_1", hostUid: 7, uid: 0, token: "viewer-tok", expiresInSeconds: 7200 });
});

describe("GET publisher", () => {
  it("rejects non-hosts", async () => {
    hoisted.requireHostAccess.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await getPublisher(req("GET"), ctx)).status).toBe(403);
  });

  it("returns the App ID only, never the certificate", async () => {
    const res = await getPublisher(req("GET"), ctx);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"publisher":"agora"');
    expect(text).toContain('"agoraAppId":"app"');
    expect(text).not.toContain("SECRET-CERT");
  });

  it("defaults to AWS and no App ID when AWS is selected", async () => {
    hoisted.resolveHostPublisher.mockResolvedValue("aws_ivs");
    const body = (await (await getPublisher(req("GET"), ctx)).json()) as Record<string, unknown>;
    expect(body.publisher).toBe("aws_ivs");
    expect(body.agoraAppId).toBeNull();
  });

  it("falls back to AWS when the lookup throws", async () => {
    hoisted.resolveHostPublisher.mockRejectedValue(new Error("db down"));
    const res = await getPublisher(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { publisher: string }).publisher).toBe("aws_ivs");
  });
});

describe("agora session routes", () => {
  it("POST refuses when the backup provider is not active for the room", async () => {
    hoisted.resolveHostPublisher.mockResolvedValue("aws_ivs");
    const res = await postSession(req("POST"), ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("AGORA_NOT_ACTIVE");
    expect(hoisted.prepareAgoraHostSession).not.toHaveBeenCalled();
  });

  it("POST honors the seller terms gate", async () => {
    hoisted.requireSellerTermsToStart.mockResolvedValue(NextResponse.json({ error: "terms" }, { status: 403 }));
    expect((await postSession(req("POST"), ctx)).status).toBe(403);
    expect(hoisted.prepareAgoraHostSession).not.toHaveBeenCalled();
  });

  it("POST returns join details for the host", async () => {
    const res = await postSession(req("POST"), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; agora: typeof SESSION };
    expect(body.ok).toBe(true);
    expect(body.agora).toEqual(SESSION);
  });

  it("PATCH mints a fresh token", async () => {
    const res = await patchSession(req("PATCH"), ctx);
    expect(((await res.json()) as { agora: typeof SESSION }).agora.token).toBe("tok");
  });

  it("DELETE ends the Agora session", async () => {
    const res = await deleteSession(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(hoisted.endAgoraHostSession).toHaveBeenCalledWith("room_1");
  });
});

describe("live route", () => {
  it("confirms the host is publishing", async () => {
    const res = await postLive(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect(hoisted.confirmAgoraHostLive).toHaveBeenCalledWith("room_1");
  });

  it("rejects non-hosts", async () => {
    hoisted.requireHostAccess.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await postLive(req("POST"), ctx)).status).toBe(401);
    expect(hoisted.confirmAgoraHostLive).not.toHaveBeenCalled();
  });
});

describe("viewer route", () => {
  it("gives anyone (guests included) a subscribe-only pass for an Agora room", async () => {
    hoisted.getStreamRow.mockResolvedValue({ ...ROW, streamProvider: "agora_rtc" });
    const res = await getViewer(req("GET"), ctx);
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("viewer-tok");
    expect(text).not.toContain("SECRET-CERT");
  });

  it("refuses rooms that are not on Agora", async () => {
    hoisted.getStreamRow.mockResolvedValue({ ...ROW, streamProvider: "aws_ivs" });
    expect((await getViewer(req("GET"), ctx)).status).toBe(409);
  });

  it("404s an unknown room and 503s when Agora is not configured", async () => {
    hoisted.getStreamRow.mockResolvedValue(null);
    expect((await getViewer(req("GET"), ctx)).status).toBe(404);
    hoisted.isAgoraConfigured.mockReturnValue(false);
    expect((await getViewer(req("GET"), ctx)).status).toBe(503);
  });
});
