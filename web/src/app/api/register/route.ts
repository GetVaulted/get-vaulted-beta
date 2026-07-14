import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  VERIFICATION_CODE_TTL_MS,
  generateVerificationCode,
  hashVerificationCode,
} from "@/lib/email-verification-code";
import { Prisma } from "@/generated/prisma/client";
import { isDevTempNoDatabaseMode } from "@/lib/dev-temp-no-db";
import { prisma } from "@/lib/prisma";
import { isApiDevVerificationAssistAllowed, isDevSkipVerificationEmail } from "@/lib/dev-verification-assist";
import { isBetaDeployment, isWebSignupResendConfigured } from "@/lib/is-beta-deployment";
import { registerAccountViaSupabaseAuth } from "@/lib/register-via-supabase-auth";
import { validateUsernameForRegistration } from "@/lib/register-validate-username";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { allocateUniqueReferralCode, normalizeReferralCodeInput } from "@/lib/referral-code";
import { sendSignupVerificationEmail } from "@/lib/send-verification-email";

function redactConnectionStrings(message: string): string {
  return message.replace(/(postgres(ql)?:\/\/)[^\s@]+@/gi, "$1***@");
}

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function uniqueViolationFields(e: Prisma.PrismaClientKnownRequestError): string[] {
  const t = e.meta?.target;
  if (Array.isArray(t)) return t.map((x) => String(x));
  if (typeof t === "string") return [t];
  return [];
}

function isLikelyDatabaseConnectionError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P1001" || e.code === "ECONNREFUSED") return true;
  }
  if (e instanceof Error) {
    return /\bECONNREFUSED\b|P1001|Can't reach database server/i.test(e.message);
  }
  return false;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const email = typeof body === "object" && body && "email" in body ? String((body as { email: unknown }).email).trim().toLowerCase() : "";
  const rawUsername =
    typeof body === "object" && body && "username" in body ? String((body as { username: unknown }).username) : "";
  const password =
    typeof body === "object" && body && "password" in body ? String((body as { password: unknown }).password) : "";
  const referralCode =
    typeof body === "object" && body && "referralCode" in body
      ? normalizeReferralCodeInput(String((body as { referralCode: unknown }).referralCode))
      : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email.", code: "INVALID_EMAIL" }, { status: 400 });
  }
  // Modest, non-punishing policy (mirrors the client-side check in SignupForm.tsx): 8+ chars,
  // at least one letter, at least one number. Intentionally no special-character/mixed-case
  // requirement — that's overly strict for a consumer marketplace and increases signup friction.
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (password.length < 8 || !hasLetter || !hasNumber) {
    return NextResponse.json(
      {
        error: "Password needs 8+ characters, including a letter and a number.",
        code: "INVALID_PASSWORD",
      },
      { status: 400 },
    );
  }

  try {
    const usernameResult = await validateUsernameForRegistration(prisma, rawUsername);
    if (!usernameResult.ok) {
      const status = usernameResult.reason === "taken" ? 409 : 400;
      const code = usernameResult.reason === "taken" ? "USERNAME_TAKEN" : "USERNAME_INVALID";
      return NextResponse.json({ error: usernameResult.message, code }, { status });
    }

    const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      return NextResponse.json(
        {
          error: "An account with this email already exists. Please sign in.",
          code: "ACCOUNT_EXISTS",
        },
        { status: 409 },
      );
    }

    if (isBetaDeployment()) {
      const supa = await registerAccountViaSupabaseAuth({
        email,
        password,
        username: usernameResult.normalized,
        referralCode: referralCode || undefined,
      });
      if (!supa.ok) {
        const status = supa.code === "ACCOUNT_EXISTS" ? 409 : 503;
        return NextResponse.json({ error: supa.message, code: supa.code }, { status });
      }
      return NextResponse.json({
        ok: true as const,
        verificationMethod: supa.verificationMethod,
        needsEmailConfirmation: supa.needsEmailConfirmation,
      });
    }

    const hasResend = isWebSignupResendConfigured();
    if (process.env.NODE_ENV === "production" && !hasResend) {
      return NextResponse.json(
        {
          error: "Sign-up is temporarily unavailable (email not configured). Please try again later.",
          code: "EMAIL_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const plainCode = generateVerificationCode();
    const codeHash = await hashVerificationCode(plainCode);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    let userId: string;
    try {
      const ownReferralCode = await allocateUniqueReferralCode();
      const user = await prisma.user.create({
        data: {
          email,
          username: usernameResult.normalized,
          name: usernameResult.normalized,
          passwordHash,
          emailVerified: null,
          referralCode: ownReferralCode,
          emailVerificationCodes: {
            create: { codeHash, expiresAt },
          },
        },
        select: { id: true },
      });
      userId = user.id;
      if (referralCode) {
        const { attributeReferralOnSignup } = await import("@/lib/referral-credit");
        await attributeReferralOnSignup(userId, referralCode);
      }
      const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
      scheduleNotifyAdmins({
        type: "admin_new_user",
        title: "New account created",
        body: `@${usernameResult.normalized} (${email}) just signed up.`,
        href: "/admin/users",
        dedupeKey: `new-user:${userId}`,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const fields = uniqueViolationFields(e);
        if (fields.some((f) => f === "email")) {
          return NextResponse.json(
            {
              error: "An account with this email already exists. Please sign in.",
              code: "ACCOUNT_EXISTS",
            },
            { status: 409 },
          );
        }
        if (fields.some((f) => f === "username")) {
          return NextResponse.json({ error: "That username is already taken.", code: "USERNAME_TAKEN" }, { status: 409 });
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.error("[register] create failed", e);
      }
      const debugMessage =
        process.env.NODE_ENV === "development" && e instanceof Error
          ? redactConnectionStrings(e.message).slice(0, 400)
          : undefined;
      return NextResponse.json(
        {
          error: "Could not create your account. Please try again.",
          code: "SERVER_ERROR",
          ...(debugMessage ? { debugMessage } : {}),
        },
        { status: 500 },
      );
    }

    if (hasResend && !isDevSkipVerificationEmail()) {
      const sent = await sendSignupVerificationEmail({ to: email, code: plainCode });
      if (!sent.ok) {
        try {
          await prisma.user.delete({ where: { id: userId } });
        } catch {
          /* best-effort rollback */
        }
        return NextResponse.json(
          { error: sent.userMessage, code: "EMAIL_SEND_FAILED" },
          { status: 503 },
        );
      }
      return NextResponse.json({
        ok: true as const,
        verificationMethod: "resend_code" as const,
        needsEmailConfirmation: true,
      });
    }

    if (isApiDevVerificationAssistAllowed()) {
      return NextResponse.json({
        ok: true as const,
        _localDevVerificationCode: plainCode,
      });
    }

    return NextResponse.json({ error: "Sign-up is unavailable.", code: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[register] failed before or after user create", e);
    }
    const debugMessage =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? redactConnectionStrings(e.message).slice(0, 400)
        : undefined;

    let errorMsg =
      "Could not create your account. Check that the database is running and DATABASE_URL is set (see .env.example).";
    if (
      process.env.NODE_ENV === "development" &&
      isDevTempNoDatabaseMode() &&
      isLikelyDatabaseConnectionError(e)
    ) {
      errorMsg +=
        " Username check can succeed without Postgres when GV_DEV_TEMP_NO_DB=1, but sign-up still needs a working DATABASE_URL — remove GV_DEV_TEMP_NO_DB or fix the connection string.";
    }

    return NextResponse.json(
      {
        error: errorMsg,
        code: "SERVER_ERROR",
        ...(debugMessage ? { debugMessage } : {}),
      },
      { status: 503 },
    );
  }
}
