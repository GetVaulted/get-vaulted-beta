import { NextResponse } from "next/server";
import { completeProfileSetup, getProfileSetupStatus } from "@/lib/profile-setup";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const status = await getProfileSetupStatus(auth.userId);
  if (!status) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  return NextResponse.json(status);
}

type PostBody = {
  username?: unknown;
  referralCode?: unknown;
};

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await completeProfileSetup({
    userId: auth.userId,
    username: body.username,
    referralCode: body.referralCode,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    username: result.username,
    usernameChosenAt: result.usernameChosenAt,
  });
}
