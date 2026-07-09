import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeUsername } from "@/lib/profile-setup";
import { getUsernameChangeEligibility } from "@/lib/username-change-policy";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true, usernameChosenAt: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const eligibility = await getUsernameChangeEligibility({
    userId: auth.userId,
    usernameChosenAt: user.usernameChosenAt,
  });

  return NextResponse.json({
    username: user.username,
    usernameChosenAt: user.usernameChosenAt?.toISOString() ?? null,
    canClaimOfficialPlatformUsername: user.role === "admin",
    ...eligibility,
  });
}

type PatchBody = {
  username?: unknown;
};

export async function PATCH(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await changeUsername({ userId: auth.userId, username: body.username });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    username: result.username,
    usernameChosenAt: result.usernameChosenAt,
  });
}
