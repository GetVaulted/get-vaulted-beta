import { NextResponse } from "next/server";
import { clearPhoneVerificationCache, normalizePhoneE164 } from "@/lib/phone-verification";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { checkPhoneVerificationCode } from "@/lib/twilio-verify";

/** Confirm the 6-digit code; on success the number is permanently linked to this account. */
export async function POST(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: { phone?: unknown; code?: unknown } = {};
  try {
    body = (await req.json()) as { phone?: unknown; code?: unknown };
  } catch {
    /* handled below */
  }
  const phone = normalizePhoneE164(body.phone);
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!phone || !/^\d{4,10}$/.test(code)) {
    return NextResponse.json({ error: "Enter the code we texted you.", code: "INVALID_CODE" }, { status: 400 });
  }

  const limited = checkRateLimit(`phone-check:user:${auth.userId}`, { limit: 8, windowMs: 15 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const result = await checkPhoneVerificationCode(phone, code);
  if (!result.ok) {
    const status = result.reason === "rate_limited" ? 429 : result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: "We couldn't check that code. Try again.", code: result.reason.toUpperCase() }, { status });
  }
  if (!result.approved) {
    return NextResponse.json(
      { error: "That code is wrong or expired. Check it, or request a new one.", code: "WRONG_CODE" },
      { status: 400 },
    );
  }

  try {
    await prisma.user.update({
      where: { id: auth.userId },
      data: { phoneE164: phone, phoneVerifiedAt: new Date() },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        {
          error: "That number is already linked to another Get Vaulted account. Use a different number.",
          code: "PHONE_IN_USE",
        },
        { status: 409 },
      );
    }
    throw err;
  }
  clearPhoneVerificationCache(auth.userId);
  return NextResponse.json({ ok: true });
}
