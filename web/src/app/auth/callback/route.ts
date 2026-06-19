import { type NextRequest } from "next/server";
import { OAUTH_ACCESS_TOKEN_COOKIE } from "@/lib/oauth-access-token-cookie";
import {
  clearOAuthReturnToCookie,
  createSupabaseRouteHandlerAuthClient,
  readOAuthReturnTo,
  redirectWithForwardedHost,
  signInRedirect,
} from "@/lib/supabase-server-auth-client";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const { searchParams } = request.nextUrl;
  const returnTo = readOAuthReturnTo(request);

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return signInRedirect(origin, returnTo, oauthError);
  }

  const code = searchParams.get("code");
  if (!code) {
    return signInRedirect(origin, returnTo, "missing_code");
  }

  const auth = createSupabaseRouteHandlerAuthClient(request);
  if (!auth) {
    return signInRedirect(origin, returnTo, "not_configured");
  }

  const { error } = await auth.supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return signInRedirect(origin, returnTo, error.message);
  }

  const { data: sessionData, error: sessionError } = await auth.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    return signInRedirect(origin, returnTo, sessionError?.message ?? "no_session");
  }

  const bridgePath = `/auth/oauth-bridge?returnTo=${encodeURIComponent(returnTo)}`;
  const response = auth.applyCookies(redirectWithForwardedHost(request, bridgePath));
  response.cookies.set(OAUTH_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  });
  return clearOAuthReturnToCookie(response);
}
