import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { CredentialsSessionUser } from "@/lib/authenticate-supabase-credentials";
import { authOptions } from "@/lib/auth";

function sessionCookieName(): string {
  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ??
    process.env.NODE_ENV === "production";
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

/** Sets the NextAuth session cookie on a redirect response (after Supabase OAuth). */
export async function attachNextAuthSessionCookie(
  response: NextResponse,
  user: CredentialsSessionUser,
): Promise<NextResponse> {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured.");

  const cookieName = sessionCookieName();
  const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60;
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      username: user.name,
      role: user.role,
    },
    secret,
    maxAge,
  });

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieName.startsWith("__Secure-"),
    maxAge,
  });

  return response;
}
