import { type NextRequest } from "next/server";
import { authorizeSupabaseAccessToken } from "@/lib/authorize-supabase-access-token";
import { attachNextAuthSessionCookie } from "@/lib/create-nextauth-session-response";
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

  const nextAuthUser = await authorizeSupabaseAccessToken(accessToken);
  if (!nextAuthUser) {
    return signInRedirect(
      origin,
      returnTo,
      "Could not finish setting up your account. Try email sign-in or contact support.",
    );
  }

  const response = redirectWithForwardedHost(request, returnTo);
  auth.applyCookies(response);
  clearOAuthReturnToCookie(response);
  return attachNextAuthSessionCookie(response, nextAuthUser);
}
