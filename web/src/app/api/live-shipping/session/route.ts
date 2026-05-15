import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getBuyerBundledLiveShippingSessionUx } from "@/services/shipping/buyer-live-shipping-ux";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const liveShowId = (searchParams.get("liveShowId") ?? "").trim();
  if (!liveShowId) {
    return NextResponse.json({ error: "liveShowId is required." }, { status: 400 });
  }

  const payload = await getBuyerBundledLiveShippingSessionUx(session.user.id, liveShowId);
  if (!payload) {
    return NextResponse.json({ error: "Live show not found or live shipping does not apply." }, { status: 404 });
  }

  return NextResponse.json(payload);
}
