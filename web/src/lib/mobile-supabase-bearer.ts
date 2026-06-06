/**
 * Mobile clients on password-protected beta deploys send Netlify basic auth in `Authorization`
 * and the Supabase session JWT in `X-GV-Supabase-Auth` (see mobile `fetchWebApiMobile`).
 */
export function getSupabaseBearerJwt(request: Request): string | null {
  const mobileAuth = request.headers.get("x-gv-supabase-auth")?.trim();
  if (mobileAuth?.startsWith("Bearer ")) {
    const jwt = mobileAuth.slice("Bearer ".length).trim();
    return jwt || null;
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.startsWith("Bearer ")) {
    const jwt = auth.slice("Bearer ".length).trim();
    return jwt || null;
  }

  return null;
}

export function requestHasSupabaseBearer(request: Request): boolean {
  return getSupabaseBearerJwt(request) != null;
}
