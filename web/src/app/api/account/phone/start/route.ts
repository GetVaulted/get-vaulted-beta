import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { normalizePhoneE164 } from "@/lib/phone-verification";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { sendPhoneVerificationCode } from "@/lib/twilio-verify";

/** Text a 6-digit code to the given phone number. */
export async function POST(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: { phone?: unknown } = {};
  try {
    body = (await req.json()) as { phone?: unknown };
  } catch {
    /* handled below */
  }
  const phone = normalizePhoneE164(body.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid mobile number, including area code.", code: "INVALID_PHONE" },
      { status: 400 },
    );
  }

  const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { phoneVerifiedAt: true } });
  if (me?.phoneVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const perUser = checkRateLimit(`phone-start:user:${auth.userId}`, { limit: 5, windowMs: 15 * 60_000 });
  const perPhone = checkRateLimit(`phone-start:phone:${phone}`, { limit: 4, windowMs: 60 * 60_000 });
  if (!perUser.ok || !perPhone.ok) {
    return NextResponse.json(
      { error: "Too many code requests. Wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const taken = await prisma.user.findFirst({
    where: { phoneE164: phone, id: { not: auth.userId } },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      {
        error: "That number is already linked to another Get Vaulted account. Use a different number.",
        code: "PHONE_IN_USE",
      },
      { status: 409 },
    );
  }

  const sent = await sendPhoneVerificationCode(phone);
  if (!sent.ok) {
    const map = {
      not_configured: { status: 503, error: "Phone verification isn't available yet. Try again later." },
      invalid_number: { status: 400, error: "We couldn't text that number. Check it and try again." },
      rate_limited: { status: 429, error: "Too many code requests. Wait a few minutes and try again." },
      failed: { status: 502, error: "We couldn't send the code. Try again in a moment." },
    } as const;
    const m = map[sent.reason];
    return NextResponse.json({ error: m.error, code: sent.reason.toUpperCase() }, { status: m.status });
  }
  return NextResponse.json({ ok: true });
}
