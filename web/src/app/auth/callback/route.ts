import { type NextRequest } from "next/server";
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

  const bridgePath = `/auth/oauth-bridge?returnTo=${encodeURIComponent(returnTo)}`;
  const redirect = auth.applyCookies(redirectWithForwardedHost(request, bridgePath));
  return clearOAuthReturnToCookie(redirect);
}
