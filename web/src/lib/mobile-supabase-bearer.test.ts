import { describe, expect, it } from "vitest";
import { getSupabaseBearerJwt, requestHasSupabaseBearer } from "./mobile-supabase-bearer";

describe("mobile-supabase-bearer", () => {
  it("reads JWT from Authorization Bearer", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { Authorization: "Bearer abc.def.ghi" },
    });
    expect(getSupabaseBearerJwt(req)).toBe("abc.def.ghi");
    expect(requestHasSupabaseBearer(req)).toBe(true);
  });

  it("reads JWT from X-GV-Supabase-Auth when Authorization is beta basic", () => {
    const req = new Request("https://example.com/api/test", {
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
        "X-GV-Supabase-Auth": "Bearer mobile.jwt.token",
      },
    });
    expect(getSupabaseBearerJwt(req)).toBe("mobile.jwt.token");
    expect(requestHasSupabaseBearer(req)).toBe(true);
  });

  it("returns null when only beta basic is present", () => {
    const req = new Request("https://example.com/api/test", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(getSupabaseBearerJwt(req)).toBeNull();
    expect(requestHasSupabaseBearer(req)).toBe(false);
  });
});
