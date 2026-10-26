import { NextResponse } from "next/server";
import { isPhoneVerificationRequired, maskPhoneLast4 } from "@/lib/phone-verification";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isTwilioVerifyConfigured } from "@/lib/twilio-verify";

/** Does this account need to verify a phone, and has it? Used by the app to show the verify screen. */
export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { createdAt: true, phoneE164: true, phoneVerifiedAt: true, phoneVerificationRequired: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    required: isPhoneVerificationRequired(user),
    verified: Boolean(user.phoneVerifiedAt),
    phoneLast4: maskPhoneLast4(user.phoneE164),
    // False until the SMS provider is set up; the app never shows the screen in that case.
    canSendCodes: isTwilioVerifyConfigured(),
  });
}
