import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: "user" | "admin";
  }

  interface Session {
    user: {
      id: string;
      username: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    role?: "user" | "admin";
    /** Profile photo URL from Prisma `User.image` (synced from mobile Supabase avatars). */
    image?: string | null;
    /** True after we attempted a one-time Supabase→Prisma avatar pull for this JWT. */
    avatarHydrated?: boolean;
  }
}
