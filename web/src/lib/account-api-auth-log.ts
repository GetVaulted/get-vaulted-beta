import { getSupabaseBearerJwt, requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";

export type AccountApiAuthHeaderKind = "basic" | "bearer" | "other" | "none";

/** Safe request auth diagnostics for account/seller APIs (no tokens). */
export function accountApiAuthDiagnostics(request: Request) {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const xgv = request.headers.get("x-gv-supabase-auth")?.trim() ?? "";
  let authHeaderKind: AccountApiAuthHeaderKind = "none";
  if (auth.startsWith("Basic ")) authHeaderKind = "basic";
  else if (auth.startsWith("Bearer ")) authHeaderKind = "bearer";
  else if (auth) authHeaderKind = "other";

  const hasBearer = requestHasSupabaseBearer(request);

  return {
    hasXGVSupabaseAuth: Boolean(xgv),
    hasAuthorization: Boolean(auth),
    authHeaderKind,
    requestHasSupabaseBearer: hasBearer,
    hasJwt: getSupabaseBearerJwt(request) != null,
    authSource: hasBearer ? ("supabase_bearer" as const) : ("session" as const),
    client: request.headers.get("x-gv-client") ?? null,
  };
}
