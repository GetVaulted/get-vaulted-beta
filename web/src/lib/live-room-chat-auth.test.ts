import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireBearer: vi.fn(),
  cookieAuth: vi.fn(),
}));
vi.mock("@/lib/require-supabase-bearer", () => ({ requireUserIdFromSupabaseBearer: hoisted.requireBearer }));
vi.mock("@/lib/resolve-live-rooms-auth", () => ({ resolveLiveRoomsUserId: hoisted.cookieAuth }));

import { CHAT_AUTH_CACHE_TTL_MS, clearChatAuthCache, resolveChatSenderId } from "@/lib/live-room-chat-auth";

function jwt(expSeconds?: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(expSeconds === undefined ? { sub: "u" } : { sub: "u", exp: expSeconds })}.sig`;
}

const bearerReq = (token: string) => new Request("https://x.test/api", { headers: { authorization: `Bearer ${token}` } });

describe("resolveChatSenderId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearChatAuthCache();
    hoisted.requireBearer.mockResolvedValue({ userId: "user-1", supabaseAuthUserId: "sb-1" });
    hoisted.cookieAuth.mockResolvedValue({ userId: "web-user" });
  });

  it("uses the cookie session (no network auth) when there is no bearer token", async () => {
    const res = await resolveChatSenderId(new Request("https://x.test/api"));
    expect(res).toEqual({ userId: "web-user" });
    expect(hoisted.requireBearer).not.toHaveBeenCalled();
  });

  it("verifies a bearer token once and skips the Stripe sync", async () => {
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    expect(await resolveChatSenderId(bearerReq(t))).toEqual({ userId: "user-1" });
    expect(hoisted.requireBearer).toHaveBeenCalledWith(expect.any(Request), { skipStripeSiblingSync: true });
  });

  it("does not re-verify the same token for a burst of messages", async () => {
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    for (let i = 0; i < 5; i++) expect(await resolveChatSenderId(bearerReq(t))).toEqual({ userId: "user-1" });
    expect(hoisted.requireBearer).toHaveBeenCalledTimes(1);
  });

  it("re-verifies after the cache window", async () => {
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    let now = 1_000_000;
    await resolveChatSenderId(bearerReq(t), () => now);
    now += CHAT_AUTH_CACHE_TTL_MS - 1;
    await resolveChatSenderId(bearerReq(t), () => now);
    expect(hoisted.requireBearer).toHaveBeenCalledTimes(1);
    now += 2;
    await resolveChatSenderId(bearerReq(t), () => now);
    expect(hoisted.requireBearer).toHaveBeenCalledTimes(2);
  });

  it("never trusts a cached token past the token's own expiry", async () => {
    const now0 = 5_000_000;
    const t = jwt(Math.floor((now0 + 10_000) / 1000)); // expires in 10s
    let now = now0;
    await resolveChatSenderId(bearerReq(t), () => now);
    now = now0 + 11_000;
    await resolveChatSenderId(bearerReq(t), () => now);
    expect(hoisted.requireBearer).toHaveBeenCalledTimes(2);
  });

  it("keeps different tokens and different users apart", async () => {
    hoisted.requireBearer
      .mockResolvedValueOnce({ userId: "user-a", supabaseAuthUserId: "a" })
      .mockResolvedValueOnce({ userId: "user-b", supabaseAuthUserId: "b" });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const ta = jwt(exp) + "a";
    const tb = jwt(exp) + "b";
    expect(await resolveChatSenderId(bearerReq(ta))).toEqual({ userId: "user-a" });
    expect(await resolveChatSenderId(bearerReq(tb))).toEqual({ userId: "user-b" });
    expect(await resolveChatSenderId(bearerReq(ta))).toEqual({ userId: "user-a" });
  });

  it("passes auth failures through and does not cache them", async () => {
    const fail = NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    hoisted.requireBearer.mockResolvedValueOnce(fail);
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    expect(await resolveChatSenderId(bearerReq(t))).toBe(fail);
    expect(await resolveChatSenderId(bearerReq(t))).toEqual({ userId: "user-1" });
    expect(hoisted.requireBearer).toHaveBeenCalledTimes(2);
  });
});
