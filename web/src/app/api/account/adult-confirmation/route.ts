import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export const runtime = "nodejs";

/** Whether this buyer has confirmed they are 18+ (needed before random-reveal purchases). */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { adultConfirmedAt: true },
  });
  return NextResponse.json({ confirmed: Boolean(user?.adultConfirmedAt) });
}

/**
 * Record the buyer's 18+ self-confirmation. Body must be `{ "confirm": true }`.
 * Idempotent: the first confirmation time is kept.
 */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: { confirm?: unknown } = {};
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    /* handled below */
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirm that you are 18 or older to continue." }, { status: 400 });
  }

  await prisma.user.updateMany({
    where: { id: auth.userId, adultConfirmedAt: null },
    data: { adultConfirmedAt: new Date() },
  });
  return NextResponse.json({ confirmed: true });
}
