import { getSupabaseAuthServerClient } from "@/lib/authenticate-supabase-credentials";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { normalizeReferralCodeInput } from "@/lib/referral-code";
import { prisma } from "@/lib/prisma";

export type SupabaseRegisterFailureCode =
  | "ACCOUNT_EXISTS"
  | "SUPABASE_NOT_CONFIGURED"
  | "SUPABASE_SIGNUP_FAILED"
  | "WEAK_PASSWORD"
  | "SIGNUP_RATE_LIMITED"
  | "SIGNUP_DISABLED"
  | "DISPOSABLE_EMAIL";

export type SupabaseRegisterResult =
  | {
      ok: true;
      needsEmailConfirmation: boolean;
      verificationMethod: "supabase_link" | "immediate";
    }
  | { ok: false; code: SupabaseRegisterFailureCode; message: string };

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
  /** `?ref=<referralCode>` from a signup link, or a manually-entered referral code. */
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

  const referralCode = normalizeReferralCodeInput(params.referralCode) || undefined;

  const { data, error } = await sb.auth.signUp({
    email,
    password: params.password,
    options: {
      data: { username, display_name: username, ...(referralCode ? { referral_code: referralCode } : {}) },
      emailRedirectTo: signupRedirectUrl(),
    },
  });

  if (error) {
    const raw = (error.message ?? "").trim();
    const errCode = (error as { code?: string }).code ?? "";
    const errStatus = (error as { status?: number }).status;

    if (/already registered|already exists|user already registered/i.test(raw)) {
      return {
        ok: false,
        code: "ACCOUNT_EXISTS",
        message: "An account with this email already exists. Please sign in.",
      };
    }
    // Supabase enforces its OWN password policy server-side (min length, required character
    // classes, and optional leaked-password protection) for both web and mobile signups. When it
    // rejects a password our client accepted, surface Supabase's own guidance so the user knows
    // exactly what to change instead of a generic failure. NOTE: the real fix is aligning the
    // Supabase Auth password policy with the app copy ("8+ chars, a letter, a number").
    if (errCode === "weak_password" || /password/i.test(raw)) {
      return {
        ok: false,
        code: "WEAK_PASSWORD",
        message: raw || "Choose a stronger password and try again.",
      };
    }
    if (
      errStatus === 429 ||
      errCode === "over_email_send_rate_limit" ||
      errCode === "over_request_rate_limit" ||
      /rate limit/i.test(raw)
    ) {
      return {
        ok: false,
        code: "SIGNUP_RATE_LIMITED",
        message: "Too many sign-up attempts right now. Please wait a minute and try again.",
      };
    }
    if (errCode === "signup_disabled" || /signups?\b.*(not allowed|disabled|closed)/i.test(raw)) {
      return {
        ok: false,
        code: "SIGNUP_DISABLED",
        message: "Sign-ups are temporarily closed. Please try again later.",
      };
    }
    // Rejected by the "Before User Created" Auth Hook (see
    // src/app/api/auth-hooks/before-user-created/route.ts) — Supabase relays the hook's own
    // error message back through signUp()'s AuthApiError, so pass it straight through rather
    // than falling into the generic SUPABASE_SIGNUP_FAILED bucket below.
    if (/email provider isn.?t supported/i.test(raw)) {
      return { ok: false, code: "DISPOSABLE_EMAIL", message: raw };
    }
    console.error("[registerAccountViaSupabaseAuth]", { status: errStatus, code: errCode, message: raw });
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
