import { describe, expect, it } from "vitest";
import { accountApiAuthDiagnostics } from "./account-api-auth-log";

describe("accountApiAuthDiagnostics", () => {
  it("detects beta basic + X-GV-Supabase-Auth mobile auth", () => {
    const req = new Request("https://example.com/api/account/sales/layaways", {
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
        "X-GV-Supabase-Auth": "Bearer abc.def.ghi",
        "X-GV-Client": "getvaulted-mobile",
      },
    });
    expect(accountApiAuthDiagnostics(req)).toEqual({
      hasXGVSupabaseAuth: true,
      hasAuthorization: true,
      authHeaderKind: "basic",
      requestHasSupabaseBearer: true,
      hasJwt: true,
      authSource: "supabase_bearer",
      client: "getvaulted-mobile",
    });
  });

  it("detects direct Authorization Bearer", () => {
    const req = new Request("https://example.com/api/account/sales/layaways", {
      headers: { Authorization: "Bearer abc.def.ghi" },
    });
    const diag = accountApiAuthDiagnostics(req);
    expect(diag.authHeaderKind).toBe("bearer");
    expect(diag.requestHasSupabaseBearer).toBe(true);
    expect(diag.authSource).toBe("supabase_bearer");
  });

  it("reports session path when no bearer is present", () => {
    const req = new Request("https://example.com/api/account/sales/layaways");
    const diag = accountApiAuthDiagnostics(req);
    expect(diag.requestHasSupabaseBearer).toBe(false);
    expect(diag.authSource).toBe("session");
  });
});
