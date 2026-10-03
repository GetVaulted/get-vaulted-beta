import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/safe-return-to";
import { buildWebOAuthCallbackOrigin } from "@/lib/supabase-oauth-redirect";
import {
  attachOAuthReturnToCookie,
  createSupabaseRouteHandlerAuthClient,
  publicRequestOrigin,
  signInRedirect,
} from "@/lib/supabase-server-auth-client";

const ALLOWED_PROVIDERS = new Set(["google", "apple"]);

/** Starts OAuth on the server so the PKCE verifier is stored in cookies before Google/Apple redirect. */
export async function GET(request: NextRequest) {
  const origin = publicRequestOrigin(request);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const provider = request.nextUrl.searchParams.get("provider")?.trim().toLowerCase() ?? "";

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return signInRedirect(origin, returnTo, "unsupported_provider");
  }

  const auth = createSupabaseRouteHandlerAuthClient(request);
  if (!auth) {
    return signInRedirect(origin, returnTo, "not_configured");
  }

  const redirectTo = buildWebOAuthCallbackOrigin(origin);
  const { data, error } = await auth.supabase.auth.signInWithOAuth({
    provider: provider as "google" | "apple",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error) {
    return signInRedirect(origin, returnTo, error.message);
  }
  if (!data.url) {
    return signInRedirect(origin, returnTo, "oauth_start_failed");
  }

  const redirect = auth.applyCookies(NextResponse.redirect(data.url));
  return attachOAuthReturnToCookie(redirect, returnTo);
}
