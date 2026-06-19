import { encode } from "next-auth/jwt";
import type { NextResponse } from "next/server";
import type { CredentialsSessionUser } from "@/lib/authenticate-supabase-credentials";
import { authOptions } from "@/lib/auth";

const CHUNK_SIZE = 4096 - 163;

/** Matches `getToken()` / NextAuth cookie naming (not `NODE_ENV` alone). */
export function nextAuthUseSecureCookies(): boolean {
  return (
    process.env.NEXTAUTH_URL?.startsWith("https://") ??
    Boolean(process.env.VERCEL)
  );
}

function sessionTokenCookieName(): string {
  return nextAuthUseSecureCookies()
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

type SessionChunk = {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    path: string;
    secure: boolean;
    expires: Date;
  };
};

function chunkSessionCookie(name: string, value: string, expires: Date, secure: boolean): SessionChunk[] {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    expires,
  };
  const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
  if (chunkCount <= 1) {
    return [{ name, value, options }];
  }
  const cookies: SessionChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    cookies.push({
      name: `${name}.${i}`,
      value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      options,
    });
  }
  return cookies;
}

/** Builds session cookies the same way NextAuth does after credentials sign-in. */
export async function buildNextAuthSessionCookieChunks(
  user: CredentialsSessionUser,
): Promise<SessionChunk[]> {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured.");

  const sessionMaxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60;
  const useSecureCookies = nextAuthUseSecureCookies();
  const cookieName = sessionTokenCookieName();

  const defaultToken = {
    name: user.name,
    email: user.email,
    sub: user.id,
  };

  const jwtCallback = authOptions.callbacks?.jwt;
  if (!jwtCallback) throw new Error("NextAuth jwt callback is not configured.");

  const token = await jwtCallback({
    token: defaultToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    account: {
      providerAccountId: user.id,
      type: "credentials",
      provider: "supabase-oauth",
    },
    isNewUser: false,
    trigger: "signIn",
  });

  const encoded = await encode({
    token,
    secret,
    maxAge: sessionMaxAge,
  });

  const expires = new Date(Date.now() + sessionMaxAge * 1000);
  return chunkSessionCookie(cookieName, encoded, expires, useSecureCookies);
}

export async function attachNextAuthSessionCookies(
  response: NextResponse,
  user: CredentialsSessionUser,
): Promise<NextResponse> {
  const chunks = await buildNextAuthSessionCookieChunks(user);
  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, chunk.options);
  }
  return response;
}
