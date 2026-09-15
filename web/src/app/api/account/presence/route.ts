import { NextResponse } from "next/server";
import { parseAppPresencePlatform, recordAppPresence } from "@/lib/app-presence";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  platform?: unknown;
};

/** Signed-in foreground heartbeat for admin “online now” counts. */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = parseAppPresencePlatform(body.platform);
  if (!platform) {
    return NextResponse.json({ error: "platform must be ios, android, or web." }, { status: 400 });
  }

  const result = await recordAppPresence({ userId: auth.userId, platform });
  if (result.skipped) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ ok: true });
}
