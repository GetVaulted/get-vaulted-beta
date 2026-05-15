import { NextResponse } from "next/server";
import {
  VERIFICATION_CODE_TTL_MS,
  generateVerificationCode,
  hashVerificationCode,
} from "@/lib/email-verification-code";
import { isApiDevVerificationAssistAllowed, isDevSkipVerificationEmail } from "@/lib/dev-verification-assist";
import { prisma } from "@/lib/prisma";
import { sendSignupVerificationEmail } from "@/lib/send-verification-email";

const RESEND_COOLDOWN_MS = 60_000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const email =
    typeof body === "object" && body && "email" in body ? String((body as { email: unknown }).email).trim().toLowerCase() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email.", code: "INVALID_EMAIL" }, { status: 400 });
  }

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  if (process.env.NODE_ENV === "production" && !hasResend) {
    return NextResponse.json(
      { error: "Email delivery is not configured. Please try again later.", code: "EMAIL_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ ok: true as const });
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true as const });
  }

  const latest = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const now = Date.now();
  if (latest && now - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - latest.createdAt.getTime())) / 1000);
    return NextResponse.json(
      {
        error: `Please wait ${waitSec}s before requesting another code.`,
        code: "RATE_LIMITED",
      },
      { status: 429 },
    );
  }

  const plainCode = generateVerificationCode();
  const codeHash = await hashVerificationCode(plainCode);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

  await prisma.emailVerificationCode.deleteMany({
    where: { userId: user.id, consumedAt: null },
  });

  await prisma.emailVerificationCode.create({
    data: { userId: user.id, codeHash, expiresAt },
  });

  if (hasResend && !isDevSkipVerificationEmail()) {
    const sent = await sendSignupVerificationEmail({ to: email, code: plainCode });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.userMessage, code: "EMAIL_SEND_FAILED" }, { status: 503 });
    }
    return NextResponse.json({ ok: true as const });
  }

  if (isApiDevVerificationAssistAllowed()) {
    return NextResponse.json({ ok: true as const, _localDevVerificationCode: plainCode });
  }

  return NextResponse.json({ error: "Email delivery is not configured.", code: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
}
