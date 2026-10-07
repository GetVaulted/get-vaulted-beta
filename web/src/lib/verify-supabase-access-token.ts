import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Verifies a Supabase access token for API routes WITHOUT depending on Supabase Auth being up.
 *
 * Why this exists: every authenticated app request used to ask the Supabase Auth server "who is this?"
 * (`auth.getUser`) with no time limit. When Auth stopped answering (Oct 6, 2026, ~02:27-02:45 UTC) each of those
 * calls hung for ~21 seconds and then failed, so every request in the app hung or failed with it, and the
 * pile-up of waiting requests opened thousands of database connections at once.
 *
 * Now:
 *  1. The token's signature and expiry are checked locally against Supabase's public signing keys (JWKS).
 *     No network call per request; the keys are cached, and the last good copy is kept if a refresh fails.
 *  2. Only if local checking cannot decide (e.g. the token has no email, or the project signs tokens with a
 *     shared secret) do we ask the Auth server, and that call is cut off after {@link AUTH_NETWORK_TIMEOUT_MS}.
 *  3. The caller is told apart: `invalid` (definitely a bad token -> 401) vs `unavailable` (could not check ->
 *     503 / stale cache), so an outage never looks like "your session expired".
 *
 * Trade-off: a token revoked at Supabase (sign-out everywhere, deleted session) keeps working locally until it
 * expires (Supabase default: 1 hour). Suspension and account deletion are still enforced from our own database.
 */

export const AUTH_NETWORK_TIMEOUT_MS = 4_000;
const JWKS_REFRESH_MS = 10 * 60_000;

export type VerifiedSupabaseToken =
  | { ok: true; user: User; source: "local" | "auth-server" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "unavailable" };

type Jwk = Record<string, unknown> & { kid?: string };
type JwksState = { keys: Jwk[]; fetchedAtMs: number };

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = "";
let jwksState: JwksState | null = null;
let jwksInflight: Promise<void> | null = null;

function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

/** One shared client per server instance; every request it makes is cut off after the timeout. */
function getClient(cfg: { url: string; anonKey: string }): SupabaseClient {
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(AUTH_NETWORK_TIMEOUT_MS) }),
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

async function fetchJwks(cfg: { url: string; anonKey: string }): Promise<JwksState | null> {
  try {
    const res = await fetch(`${cfg.url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: cfg.anonKey },
      signal: AbortSignal.timeout(AUTH_NETWORK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) return null;
    return { keys: body.keys, fetchedAtMs: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Public signing keys for local verification. Never throws. If a refresh fails, the previous copy keeps being
 * used (public keys rarely change, and an outage is exactly when we need them).
 */
async function ensureJwks(cfg: { url: string; anonKey: string }, nowMs: number): Promise<Jwk[] | null> {
  const fresh = jwksState && nowMs - jwksState.fetchedAtMs < JWKS_REFRESH_MS;
  if (fresh) return jwksState!.keys;
  if (!jwksInflight) {
    jwksInflight = (async () => {
      const next = await fetchJwks(cfg);
      if (next) jwksState = next;
    })().finally(() => {
      jwksInflight = null;
    });
  }
  // A cold instance has to wait for its first copy; a warm one refreshes in the background.
  if (!jwksState) await jwksInflight;
  return jwksState ? jwksState.keys : null;
}

type ClaimsLike = {
  sub?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
  is_anonymous?: unknown;
  app_metadata?: unknown;
  user_metadata?: unknown;
};

/** A Supabase `User`-shaped object built from verified token claims (only the fields our code reads). */
export function userFromClaims(claims: ClaimsLike): User | null {
  const id = typeof claims.sub === "string" ? claims.sub : "";
  if (!id) return null;
  if (claims.role !== "authenticated") return null;
  const email = typeof claims.email === "string" && claims.email.trim() ? claims.email.trim() : null;
  // No email in the token (some Apple / phone sign-ins): our user-matching needs the full Auth user record.
  if (!email) return null;
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    phone: typeof claims.phone === "string" ? claims.phone : "",
    app_metadata: (claims.app_metadata as User["app_metadata"]) ?? {},
    user_metadata: (claims.user_metadata as User["user_metadata"]) ?? {},
    is_anonymous: claims.is_anonymous === true,
    created_at: "",
  } as User;
}

type AuthErrorLike = { name?: string; status?: number; code?: string } | null | undefined;

/** True only when Supabase (or the local check) says the token itself is bad. Anything else is "could not check". */
export function isDefinitelyInvalidTokenError(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.name === "AuthInvalidJwtError") return true;
  if (error.code === "bad_jwt" || error.code === "invalid_jwt" || error.code === "session_not_found") return true;
  if (error.code === "user_not_found") return true;
  const s = error.status;
  return s === 400 || s === 401 || s === 403 || s === 404 || s === 422;
}

/** Ask the Auth server about this token (time-limited). Used only when local verification cannot decide. */
export async function verifyViaAuthServer(jwt: string): Promise<VerifiedSupabaseToken> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, reason: "unavailable" };
  try {
    const { data, error } = await getClient(cfg).auth.getUser(jwt);
    if (!error && data.user?.id) return { ok: true, user: data.user, source: "auth-server" };
    if (error && !isDefinitelyInvalidTokenError(error as AuthErrorLike)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function verifySupabaseAccessToken(jwt: string, nowMs: number = Date.now()): Promise<VerifiedSupabaseToken> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, reason: "unavailable" };

  const keys = await ensureJwks(cfg, nowMs);
  if (keys) {
    try {
      const { data, error } = await getClient(cfg).auth.getClaims(jwt, { jwks: { keys: keys as never } });
      if (data?.claims) {
        const user = userFromClaims(data.claims as ClaimsLike);
        if (user) return { ok: true, user, source: "local" };
        // Verified signature, but the token lacks what we need (email) or is not a signed-in user token.
        if ((data.claims as ClaimsLike).role !== "authenticated") return { ok: false, reason: "invalid" };
        return verifyViaAuthServer(jwt);
      }
      if (error && isDefinitelyInvalidTokenError(error as AuthErrorLike)) return { ok: false, reason: "invalid" };
    } catch {
      // fall through to the Auth server
    }
  }
  return verifyViaAuthServer(jwt);
}

/** Test hook: forget cached client and signing keys. */
export function resetVerifySupabaseTokenStateForTests(): void {
  cachedClient = null;
  cachedClientKey = "";
  jwksState = null;
  jwksInflight = null;
}
