import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reassignExpoPushTokenToUser, revokeExpoPushTokensForUser } from "@/lib/push/push-device-token";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  platform?: string;
  deviceName?: string | null;
};

/** Register or refresh an Expo push token for the signed-in user (mobile Bearer auth). */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform.slice(0, 32) : null;
  const deviceName =
    typeof body.deviceName === "string" && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 120)
      : null;

  const supabaseAuthUserId = auth.supabaseAuthUserId ?? null;

  await reassignExpoPushTokenToUser({
    userId: auth.userId,
    expoPushToken: token,
    supabaseAuthUserId,
  });

  await prisma.pushDeviceToken.upsert({
    where: {
      userId_expoPushToken: { userId: auth.userId, expoPushToken: token },
    },
    create: {
      userId: auth.userId,
      expoPushToken: token,
      platform,
      deviceName,
      supabaseAuthUserId,
    },
    update: {
      platform,
      deviceName,
      supabaseAuthUserId,
    },
  });

  if (supabaseAuthUserId) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      await admin.from("push_device_tokens").upsert(
        {
          user_id: supabaseAuthUserId,
          expo_push_token: token,
          platform,
          device_name: deviceName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,expo_push_token" },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/** Unregister Expo push token(s) for the signed-in user (logout / account switch). */
export async function DELETE(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: Body = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const supabaseAuthUserId = auth.supabaseAuthUserId ?? null;

  await revokeExpoPushTokensForUser({
    userId: auth.userId,
    expoPushToken: token || null,
    supabaseAuthUserId,
  });

  return NextResponse.json({ ok: true });
}
