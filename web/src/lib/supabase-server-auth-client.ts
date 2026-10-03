import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/safe-return-to";

export const OAUTH_RETURN_TO_COOKIE = "gv_oauth_return_to";
const OAUTH_RETURN_TO_MAX_AGE = 10 * 60;

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];

type StoredCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function supabaseAuthEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

type RouteHandlerClient = {
  supabase: SupabaseClient;
  applyCookies: (response: NextResponse) => NextResponse;
};

/**
 * Route Handler Supabase client. Stores PKCE verifier in Set-Cookie (not localStorage).
 * Must use the same request instance for /auth/start and /auth/callback in one OAuth flow.
 */
export function createSupabaseRouteHandlerAuthClient(request: NextRequest): RouteHandlerClient | null {
  const env = supabaseAuthEnv();
  if (!env) return null;

  const storedCookies = new Map<string, StoredCookie>();

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          storedCookies.set(name, { name, value, options });
        });
      },
    },
  });

  return {
    supabase,
    applyCookies(response: NextResponse) {
      storedCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}

export function signInRedirect(origin: string, returnTo: string, oauthError: string): NextResponse {
  const signIn = new URL("/signin", origin);
  signIn.searchParams.set("returnTo", returnTo);
  signIn.searchParams.set("oauthError", oauthError.slice(0, 240));
  return NextResponse.redirect(signIn);
}

export function readOAuthReturnTo(request: NextRequest, fallback = "/marketplace"): string {
  const fromQuery = request.nextUrl.searchParams.get("returnTo");
  if (fromQuery) return safeReturnTo(fromQuery);
  const fromCookie = request.cookies.get(OAUTH_RETURN_TO_COOKIE)?.value;
  return safeReturnTo(fromCookie ?? fallback);
}

export function attachOAuthReturnToCookie(response: NextResponse, returnTo: string): NextResponse {
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, safeReturnTo(returnTo), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_RETURN_TO_MAX_AGE,
  });
  return response;
}

export function clearOAuthReturnToCookie(response: NextResponse): NextResponse {
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function redirectWithForwardedHost(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(`${publicRequestOrigin(request)}${path}`);
}

/** Browser-facing origin (prefers x-forwarded-* behind Netlify so OAuth cookies match the callback host). */
export function publicRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
