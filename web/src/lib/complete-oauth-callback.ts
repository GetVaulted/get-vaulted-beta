import { getToken } from "next-auth/jwt";
import type { NextRequest, NextResponse } from "next/server";
import { authorizeSupabaseAccessToken } from "@/lib/authorize-supabase-access-token";
import { attachNextAuthSessionCookies } from "@/lib/next-auth-session-cookie";
import { prisma } from "@/lib/prisma";
import {
  clearOAuthReturnToCookie,
  createSupabaseRouteHandlerAuthClient,
  publicRequestOrigin,
  redirectWithForwardedHost,
  signInRedirect,
} from "@/lib/supabase-server-auth-client";

type RouteHandlerClient = NonNullable<ReturnType<typeof createSupabaseRouteHandlerAuthClient>>;

/** Apple/Google sometimes hit /auth/callback twice; the auth code can only be exchanged once. */
export function isBenignOAuthExchangeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already been used") ||
    m.includes("invalid grant") ||
    m.includes("code has expired") ||
    m.includes("code verifier") ||
    m.includes("auth code") ||
    m.includes("pkce") ||
    m.includes("flow state") ||
    m.includes("flow_state")
  );
}

async function redirectIfNextAuthSessionExists(
  request: NextRequest,
  returnTo: string,
): Promise<NextResponse | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.sub) return null;
  const row = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { usernameChosenAt: true },
  });
  const dest = row?.usernameChosenAt == null ? profileSetupReturnTo(returnTo) : returnTo;
  return redirectWithForwardedHost(request, dest);
}

function profileSetupReturnTo(returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `/complete-profile?${params.toString()}`;
}

async function finishOAuthLogin(
  request: NextRequest,
  auth: RouteHandlerClient,
  accessToken: string,
  returnTo: string,
): Promise<NextResponse | null> {
  const user = await authorizeSupabaseAccessToken(accessToken);
  if (!user) return null;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { usernameChosenAt: true },
  });
  const dest = row?.usernameChosenAt == null ? profileSetupReturnTo(returnTo) : returnTo;

  const response = auth.applyCookies(redirectWithForwardedHost(request, dest));
  clearOAuthReturnToCookie(response);
  await attachNextAuthSessionCookies(response, user);
  return response;
}

export async function completeOAuthCallback(
  request: NextRequest,
  returnTo: string,
): Promise<NextResponse> {
  const origin = publicRequestOrigin(request);
  const { searchParams } = request.nextUrl;

  const existingSessionRedirect = await redirectIfNextAuthSessionExists(request, returnTo);
  if (existingSessionRedirect) return existingSessionRedirect;

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
    const { data: sessionData } = await auth.supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      const completed = await finishOAuthLogin(request, auth, accessToken, returnTo);
      if (completed) return completed;
    }

    const sessionRedirect = await redirectIfNextAuthSessionExists(request, returnTo);
    if (sessionRedirect) return sessionRedirect;

    const message = isBenignOAuthExchangeError(error.message)
      ? "That sign-in link was already used or expired. Please try Continue with Google again."
      : error.message;
    return signInRedirect(origin, returnTo, message);
  }

  const { data: sessionData, error: sessionError } = await auth.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    return signInRedirect(origin, returnTo, sessionError?.message ?? "no_session");
  }

  const completed = await finishOAuthLogin(request, auth, accessToken, returnTo);
  if (completed) return completed;

  return signInRedirect(
    origin,
    returnTo,
    "Could not finish setting up your account. Try email sign-in or contact support.",
  );
}
