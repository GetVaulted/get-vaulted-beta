import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getClaims: hoisted.getClaims, getUser: hoisted.getUser } })),
}));

import {
  isDefinitelyInvalidTokenError,
  resetVerifySupabaseTokenStateForTests,
  userFromClaims,
  verifySupabaseAccessToken,
} from "@/lib/verify-supabase-access-token";

const goodClaims = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "authenticated",
  email: "Buyer@Example.com",
  app_metadata: { providers: ["email"] },
  user_metadata: { username: "buyer" },
};

function jwksResponse(ok = true): Response {
  return ok
    ? new Response(JSON.stringify({ keys: [{ kid: "k1", kty: "EC" }] }), { status: 200 })
    : new Response("down", { status: 522 });
}

describe("verifySupabaseAccessToken", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    resetVerifySupabaseTokenStateForTests();
    hoisted.getClaims.mockReset();
    hoisted.getUser.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => jwksResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies locally and never calls the Auth server when the token is good", async () => {
    hoisted.getClaims.mockResolvedValue({ data: { claims: goodClaims }, error: null });
    const res = await verifySupabaseAccessToken("jwt");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.source).toBe("local");
      expect(res.user.id).toBe(goodClaims.sub);
      expect(res.user.email).toBe("Buyer@Example.com");
    }
    expect(hoisted.getUser).not.toHaveBeenCalled();
  });

  it("reuses the signing keys instead of fetching them on every request", async () => {
    hoisted.getClaims.mockResolvedValue({ data: { claims: goodClaims }, error: null });
    await verifySupabaseAccessToken("a");
    await verifySupabaseAccessToken("b");
    await verifySupabaseAccessToken("c");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an expired or forged token without any Auth server call", async () => {
    hoisted.getClaims.mockResolvedValue({ data: null, error: { name: "AuthInvalidJwtError", status: 401 } });
    const res = await verifySupabaseAccessToken("bad");
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(hoisted.getUser).not.toHaveBeenCalled();
  });

  it("rejects a verified token that is not a signed-in user (anon key)", async () => {
    hoisted.getClaims.mockResolvedValue({ data: { claims: { role: "anon" } }, error: null });
    const res = await verifySupabaseAccessToken("anon-jwt");
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(hoisted.getUser).not.toHaveBeenCalled();
  });

  it("asks the Auth server (once) when the token has no email", async () => {
    hoisted.getClaims.mockResolvedValue({ data: { claims: { ...goodClaims, email: undefined } }, error: null });
    hoisted.getUser.mockResolvedValue({ data: { user: { id: goodClaims.sub } }, error: null });
    const res = await verifySupabaseAccessToken("jwt");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.source).toBe("auth-server");
    expect(hoisted.getUser).toHaveBeenCalledTimes(1);
  });

  it("reports 'unavailable' (not 'invalid') when the Auth server cannot be reached", async () => {
    fetchMock.mockImplementation(async () => jwksResponse(false));
    hoisted.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthUnknownError", status: 522 } });
    const res = await verifySupabaseAccessToken("jwt");
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports 'unavailable' when the Auth request throws or times out", async () => {
    fetchMock.mockImplementation(async () => jwksResponse(false));
    hoisted.getUser.mockRejectedValue(new Error("aborted"));
    const res = await verifySupabaseAccessToken("jwt");
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats a 403 from the Auth server as an invalid session", async () => {
    fetchMock.mockImplementation(async () => jwksResponse(false));
    hoisted.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 403, code: "bad_jwt" } });
    const res = await verifySupabaseAccessToken("jwt");
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("keeps verifying locally with the last good keys when a later key refresh fails", async () => {
    hoisted.getClaims.mockResolvedValue({ data: { claims: goodClaims }, error: null });
    const t0 = 1_000_000;
    await verifySupabaseAccessToken("a", t0);
    fetchMock.mockImplementation(async () => jwksResponse(false));
    const res = await verifySupabaseAccessToken("b", t0 + 11 * 60_000);
    expect(res.ok).toBe(true);
    expect(hoisted.getUser).not.toHaveBeenCalled();
  });
});

describe("userFromClaims", () => {
  it("builds the fields our account matching reads", () => {
    const u = userFromClaims(goodClaims);
    expect(u?.id).toBe(goodClaims.sub);
    expect(u?.app_metadata).toEqual({ providers: ["email"] });
    expect(u?.user_metadata).toEqual({ username: "buyer" });
  });

  it("returns null without a subject, without the authenticated role, or without an email", () => {
    expect(userFromClaims({ ...goodClaims, sub: undefined })).toBeNull();
    expect(userFromClaims({ ...goodClaims, role: "anon" })).toBeNull();
    expect(userFromClaims({ ...goodClaims, email: " " })).toBeNull();
  });
});

describe("isDefinitelyInvalidTokenError", () => {
  it("only calls client-side rejections invalid", () => {
    expect(isDefinitelyInvalidTokenError({ status: 401 })).toBe(true);
    expect(isDefinitelyInvalidTokenError({ status: 403, code: "bad_jwt" })).toBe(true);
    expect(isDefinitelyInvalidTokenError({ name: "AuthInvalidJwtError" })).toBe(true);
    expect(isDefinitelyInvalidTokenError({ status: 522 })).toBe(false);
    expect(isDefinitelyInvalidTokenError({ status: 503 })).toBe(false);
    expect(isDefinitelyInvalidTokenError({ name: "AuthRetryableFetchError", status: 0 })).toBe(false);
    expect(isDefinitelyInvalidTokenError(null)).toBe(false);
  });
});
