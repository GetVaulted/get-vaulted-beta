import { getSupabaseAuthServerClient } from "@/lib/authenticate-supabase-credentials";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { prisma } from "@/lib/prisma";

export type SupabaseRegisterResult =
  | {
      ok: true;
      needsEmailConfirmation: boolean;
      verificationMethod: "supabase_link" | "immediate";
    }
  | { ok: false; code: "ACCOUNT_EXISTS" | "SUPABASE_NOT_CONFIGURED" | "SUPABASE_SIGNUP_FAILED"; message: string };

function signupRedirectUrl(): string {
  const base =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://shopgetvaulted.com";
  return `${base.replace(/\/+$/, "")}/signin`;
}

/**
 * Register account via Supabase Auth — same path as mobile `signUpWithPassword`.
 * Used for all beta web Join flows so credentials work on both platforms.
 */
export async function registerAccountViaSupabaseAuth(params: {
  email: string;
  password: string;
  username: string;
  /** `?ref=<referrer_username>` from a signup link, or a manually-entered referral username. */
  referralCode?: string;
}): Promise<SupabaseRegisterResult> {
  const sb = getSupabaseAuthServerClient();
  if (!sb) {
    return {
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      message: "Sign-up is temporarily unavailable. Please try again later.",
    };
  }

  const email = params.email.trim().toLowerCase();
  const username = params.username.trim().toLowerCase();

  const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (emailTaken) {
    return {
      ok: false,
      code: "ACCOUNT_EXISTS",
      message: "An account with this email already exists. Please sign in.",
    };
  }

  const referralCode = params.referralCode?.trim().toLowerCase().slice(0, 20) || undefined;

  const { data, error } = await sb.auth.signUp({
    email,
    password: params.password,
    options: {
      data: { username, display_name: username, ...(referralCode ? { referral_code: referralCode } : {}) },
      emailRedirectTo: signupRedirectUrl(),
    },
  });

  if (error) {
    if (/already registered|already exists|user already registered/i.test(error.message)) {
      return {
        ok: false,
        code: "ACCOUNT_EXISTS",
        message: "An account with this email already exists. Please sign in.",
      };
    }
    console.error("[registerAccountViaSupabaseAuth]", error.message);
    return {
      ok: false,
      code: "SUPABASE_SIGNUP_FAILED",
      message: "Could not create your account. Please try again.",
    };
  }

  const user = data.user;
  if (!user) {
    return {
      ok: false,
      code: "SUPABASE_SIGNUP_FAILED",
      message: "Could not create your account. Please try again.",
    };
  }

  try {
    await ensurePrismaUserForSupabaseAuth(user);
  } catch (e) {
    console.error("[registerAccountViaSupabaseAuth] ensurePrismaUser failed", e);
  }

  const needsEmailConfirmation = !data.session;
  return {
    ok: true,
    needsEmailConfirmation,
    verificationMethod: needsEmailConfirmation ? "supabase_link" : "immediate",
  };
}
