import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { checkAuthAttemptRateLimit } from "@/lib/auth-rate-limit";
import { authorizeCredentialsViaSupabase } from "@/lib/authenticate-supabase-credentials";
import { authorizeSupabaseAccessToken } from "@/lib/authorize-supabase-access-token";
import { expiredJwtToken, resolveAuthUserForToken } from "@/lib/auth-resolve-user";
import { prisma } from "@/lib/prisma";
import { ensurePrismaAvatarFromSupabase } from "@/lib/sync-profile-avatar";
import { usesUnifiedSupabaseAuth } from "@/lib/unified-auth";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        // Keyed by email (not IP) so an attacker can't bypass it by rotating IPs; caps
        // credential-stuffing/brute-force attempts against a single account.
        if (!checkAuthAttemptRateLimit("login", email).ok) return null;

        if (usesUnifiedSupabaseAuth()) {
          const supaUser = await authorizeCredentialsViaSupabase(email, password);
          if (supaUser) return supaUser;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            username: true,
            passwordHash: true,
            role: true,
            suspendedAt: true,
            accountDeletedAt: true,
            emailVerified: true,
          },
        });

        if (user?.passwordHash && !user.suspendedAt && !user.accountDeletedAt && user.emailVerified) {
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (ok) {
            return {
              id: user.id,
              email: user.email,
              name: user.username,
              role: user.role as "user" | "admin",
            };
          }
        }

        // Legacy web-only accounts (Resend OTP path) or non-beta deploys
        return authorizeCredentialsViaSupabase(email, password);
      },
    }),
    CredentialsProvider({
      id: "supabase-oauth",
      name: "Supabase OAuth",
      credentials: {
        accessToken: { type: "text" },
      },
      async authorize(credentials) {
        return authorizeSupabaseAccessToken(credentials?.accessToken);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.username = String(user.name ?? user.email ?? "");
        const r = (user as { role?: string }).role;
        token.role = r === "admin" ? "admin" : "user";
        token.avatarHydrated = false;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const patch = session as { image?: string | null; user?: { image?: string | null } };
        const nextImage = patch.image ?? patch.user?.image;
        if (typeof nextImage === "string") {
          token.image = nextImage.trim() || null;
        } else if (nextImage === null) {
          token.image = null;
        }
      }
      if (token.sub || token.email) {
        try {
          const resolved = await resolveAuthUserForToken({
            tokenSub: typeof token.sub === "string" && token.sub.trim() ? token.sub : undefined,
            tokenEmail: typeof token.email === "string" ? token.email : undefined,
          });
          if (!resolved.ok) {
            if (trigger === "signIn" && user) {
              return token;
            }
            if (resolved.reason === "not_found") {
              console.warn("[next-auth jwt] no User row for token; expiring session", {
                sub: token.sub,
                email: token.email,
              });
            }
            return expiredJwtToken(token);
          }
          if (resolved.reboundedFromEmail) {
            console.info("[next-auth jwt] rebound session id from email (stale JWT sub vs current DB)", {
              priorSub: token.sub,
              userId: resolved.user.id,
              email: resolved.user.email,
            });
          }
          token.sub = resolved.user.id;
          token.email = resolved.user.email;
          token.username = resolved.user.username;
          token.role = resolved.user.role;

          let image = resolved.user.image;
          const shouldHydrateAvatar =
            !image && (trigger === "signIn" || trigger === "update" || !token.avatarHydrated);
          if (shouldHydrateAvatar) {
            try {
              image = await ensurePrismaAvatarFromSupabase(resolved.user.id);
            } catch (e) {
              console.error("[next-auth jwt] avatar hydrate failed", e);
            }
            token.avatarHydrated = true;
          }
          token.image = image;
        } catch (e) {
          console.error("[next-auth jwt] user lookup failed", e);
          /* keep token on transient DB errors */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.email = (token.email as string) ?? session.user.email ?? "";
        session.user.username = (token.username as string) ?? session.user.name ?? "";
        session.user.role = token.role === "admin" ? "admin" : "user";
        session.user.image = typeof token.image === "string" && token.image.trim() ? token.image : null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * next-auth's `getServerSession` throws on non-200 session responses (e.g. bad JWT / secret rotation),
 * which surfaces as a generic Next.js "Internal Server Error" in RSC and route handlers. This wrapper
 * returns null instead so callers can redirect to sign-in or return 401.
 */
export async function getServerSessionSafe() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return session;
    if (!session.user.id && !session.user.email) return session;

    try {
      const resolved = await resolveAuthUserForToken({
        tokenSub: session.user.id,
        tokenEmail: session.user.email ?? undefined,
      });
      if (!resolved.ok) {
        console.warn("[auth] getServerSessionSafe: no matching User row", {
          reason: resolved.reason,
          sessionUserId: session.user.id,
          email: session.user.email,
        });
        return null;
      }
      if (resolved.reboundedFromEmail) {
        console.info("[auth] getServerSessionSafe: aligned session user id from email lookup", {
          priorId: session.user.id,
          userId: resolved.user.id,
        });
      }
      session.user.id = resolved.user.id;
      session.user.email = resolved.user.email;
      session.user.username = resolved.user.username;
      session.user.role = resolved.user.role;
      session.user.image = resolved.user.image;
    } catch (e) {
      console.error("[auth] getServerSessionSafe: user reconcile failed", e);
      return null;
    }

    return session;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Let Next.js bail out of static generation when session reads headers/cookies.
    if (msg.includes("Dynamic server usage")) throw e;
    console.error("[next-auth] getServerSession failed:", msg);
    return null;
  }
}
