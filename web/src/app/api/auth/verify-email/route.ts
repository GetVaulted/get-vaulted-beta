import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { checkAuthAttemptRateLimit } from "@/lib/auth-rate-limit";
import {
  normalizeVerificationCodeInput,
  VERIFICATION_CODE_LENGTH,
  verificationCodesEqual,
} from "@/lib/email-verification-code";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function devVerifyLog(message: string, detail?: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[verify-email] ${message}`, detail ?? "");
  }
}

function prismaSchemaDriftResponse(e: Prisma.PrismaClientKnownRequestError) {
  if (e.code === "P2021" || e.code === "P2022" || e.message?.includes("does not exist")) {
    return NextResponse.json(
      {
        error:
          "Your database is out of date for this app version. From the project folder run: npx prisma migrate deploy (or prisma migrate dev), then restart the server.",
        code: "DATABASE_SCHEMA",
      },
      { status: 503 },
    );
  }
  return null;
}

function atMs(d: Date): number {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

type TxOutcome = "verified" | "already_verified" | "code_already_used";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const hasEmailKey = obj !== null && "email" in obj;
  const hasCodeKey = obj !== null && "code" in obj;

  if (!hasEmailKey) {
    return NextResponse.json({ error: "Email is required.", code: "EMAIL_REQUIRED" }, { status: 400 });
  }
  if (!hasCodeKey) {
    return NextResponse.json({ error: "Verification code is required.", code: "CODE_REQUIRED" }, { status: 400 });
  }

  const email = String(obj!.email ?? "")
    .trim()
    .toLowerCase();
  const rawCode = String(obj!.code ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email.", code: "INVALID_EMAIL" }, { status: 400 });
  }

  const code = normalizeVerificationCodeInput(rawCode);
  if (!code) {
    return NextResponse.json(
      { error: `Enter the ${VERIFICATION_CODE_LENGTH}-digit code from your email.`, code: "INVALID_CODE_FORMAT" },
      { status: 400 },
    );
  }

  const limiter = checkAuthAttemptRateLimit("verify-email", email);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found for this email. Check the address or start sign-up again.", code: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (user.emailVerified) {
      return NextResponse.json({ ok: true as const, alreadyVerified: true as const });
    }

    const rows = await prisma.emailVerificationCode.findMany({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, codeHash: true, expiresAt: true },
    });

    const now = Date.now();
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "No active verification code for this account. Request a new code from the verification page.",
          code: "NO_PENDING_CODE",
        },
        { status: 400 },
      );
    }

    const hasUnexpired = rows.some((r) => atMs(r.expiresAt) > now);
    if (!hasUnexpired) {
      return NextResponse.json(
        { error: "This code has expired. Request a new code from the verification page.", code: "EXPIRED_CODE" },
        { status: 400 },
      );
    }

    let matchedId: string | null = null;
    for (const row of rows) {
      if (atMs(row.expiresAt) <= now) continue;
      try {
        if (await verificationCodesEqual(code, row.codeHash)) {
          matchedId = row.id;
          break;
        }
      } catch (e) {
        devVerifyLog("bcrypt.compare failed for a verification row (skipping row)", e);
        continue;
      }
    }

    if (!matchedId) {
      return NextResponse.json({ error: "Invalid verification code.", code: "INVALID_CODE" }, { status: 400 });
    }

    let txOutcome: TxOutcome;
    try {
      txOutcome = await prisma.$transaction(async (tx) => {
        const consumed = await tx.emailVerificationCode.updateMany({
          where: { id: matchedId, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count === 1) {
          await tx.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          });
          return "verified" as const;
        }
        const u2 = await tx.user.findUnique({
          where: { id: user.id },
          select: { emailVerified: true },
        });
        if (u2?.emailVerified) return "already_verified" as const;
        return "code_already_used" as const;
      });
    } catch (e) {
      devVerifyLog("transaction failed", e);
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        devVerifyLog("Prisma error", { code: e.code, meta: e.meta, message: e.message });
        const drift = prismaSchemaDriftResponse(e);
        if (drift) return drift;
      }
      return NextResponse.json(
        { error: "Could not verify right now. Try again in a moment.", code: "SERVER_ERROR" },
        { status: 500 },
      );
    }

    if (txOutcome === "already_verified") {
      return NextResponse.json({ ok: true as const, alreadyVerified: true as const });
    }
    if (txOutcome === "code_already_used") {
      return NextResponse.json(
        {
          error: "This code was already used or is no longer valid. Request a new code if you need one.",
          code: "VERIFY_CONFLICT",
        },
        { status: 409 },
      );
    }

    void import("@/lib/giveaway/entries")
      .then(({ onUserEmailVerifiedForGiveaways }) => onUserEmailVerifiedForGiveaways(user.id))
      .catch((e) => console.warn("[verify-email] giveaway entry hook failed", e));

    return NextResponse.json({ ok: true as const });
  } catch (e) {
    devVerifyLog("unhandled error", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      devVerifyLog("Prisma known request", { code: e.code, meta: e.meta, message: e.message });
      const drift = prismaSchemaDriftResponse(e);
      if (drift) return drift;
    }
    return NextResponse.json(
      { error: "Could not verify right now. Try again in a moment.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
