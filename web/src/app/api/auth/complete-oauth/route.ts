import { NextResponse, type NextRequest } from "next/server";
import { authorizeSupabaseAccessToken } from "@/lib/authorize-supabase-access-token";
import { attachNextAuthSessionCookies } from "@/lib/next-auth-session-cookie";
import { OAUTH_ACCESS_TOKEN_COOKIE } from "@/lib/oauth-access-token-cookie";

function clearOAuthAccessTokenCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Finishes web OAuth by turning a short-lived Supabase access token into a NextAuth session. */
export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(OAUTH_ACCESS_TOKEN_COOKIE)?.value?.trim();
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const user = await authorizeSupabaseAccessToken(accessToken);
  if (!user) {
    const response = NextResponse.json(
      { error: "Could not finish setting up your account. Try email sign-in or contact support." },
      { status: 401 },
    );
    clearOAuthAccessTokenCookie(response);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  clearOAuthAccessTokenCookie(response);
  await attachNextAuthSessionCookies(response, user);
  return response;
}
