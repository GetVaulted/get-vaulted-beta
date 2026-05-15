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
import { validateUsernameForRegistration } from "@/lib/register-validate-username";
import { sendSignupVerificationEmail } from "@/lib/send-verification-email";

function redactConnectionStrings(message: string): string {
  return message.replace(/(postgres(ql)?:\/\/)[^\s@]+@/gi, "$1***@");
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

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email.", code: "INVALID_EMAIL" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters.", code: "INVALID_PASSWORD" },
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

    const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
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
      const user = await prisma.user.create({
        data: {
          email,
          username: usernameResult.normalized,
          name: usernameResult.normalized,
          passwordHash,
          emailVerified: null,
          emailVerificationCodes: {
            create: { codeHash, expiresAt },
          },
        },
        select: { id: true },
      });
      userId = user.id;
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
      return NextResponse.json({ ok: true as const });
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
