import { beforeEach, describe, expect, it } from "vitest";
import {
  BEARER_AUTH_CACHE_TTL_MS,
  clearBearerAuthCache,
  getCachedBearerAuth,
  setCachedBearerAuth,
} from "@/lib/bearer-auth-cache";

function fakeJwt(expSeconds: number): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ exp: expSeconds })}.sig`;
}

const value = { userId: "u1", supabaseAuthUserId: "s1" };

describe("bearer auth cache", () => {
  beforeEach(() => clearBearerAuthCache());

  it("returns a verified session until the TTL passes", () => {
    const now = 1_000_000;
    const jwt = fakeJwt(Math.floor(now / 1000) + 3600);
    setCachedBearerAuth(jwt, value, now);
    expect(getCachedBearerAuth(jwt, now + BEARER_AUTH_CACHE_TTL_MS - 1)).toEqual(value);
    expect(getCachedBearerAuth(jwt, now + BEARER_AUTH_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("never outlives the token's own expiry", () => {
    const now = 5_000_000;
    const jwt = fakeJwt(Math.floor(now / 1000) + 5);
    setCachedBearerAuth(jwt, value, now);
    expect(getCachedBearerAuth(jwt, now + 4_000)).toEqual(value);
    expect(getCachedBearerAuth(jwt, now + 6_000)).toBeNull();
  });

  it("does not cache an already-expired token", () => {
    const now = 9_000_000;
    const jwt = fakeJwt(Math.floor(now / 1000) - 10);
    setCachedBearerAuth(jwt, value, now);
    expect(getCachedBearerAuth(jwt, now)).toBeNull();
  });

  it("keeps different tokens separate", () => {
    const now = 2_000_000;
    const a = fakeJwt(Math.floor(now / 1000) + 3600);
    const b = fakeJwt(Math.floor(now / 1000) + 7200);
    setCachedBearerAuth(a, value, now);
    expect(getCachedBearerAuth(b, now)).toBeNull();
  });
});
