import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { createLiveTipCheckoutSession } from "@/services/live-tips";

type PostBody = {
  amountUsd?: unknown;
  message?: unknown;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountRaw = typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);
  const message = typeof body.message === "string" ? body.message : undefined;

  try {
    const result = await createLiveTipCheckoutSession({
      userId: auth.userId,
      liveRoomId,
      amountUsd: amountRaw,
      message,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start tip checkout.";
    const status =
      msg === "ROOM_NOT_FOUND"
        ? 404
        : msg === "ROOM_NOT_LIVE"
          ? 409
          : msg === "TIP_RECIPIENT_NOT_READY"
            ? 503
            : msg === "STRIPE_NOT_CONFIGURED"
              ? 503
              : 400;
    const friendly =
      msg === "ROOM_NOT_LIVE"
        ? "Tips are only available while the show is live."
        : msg === "TIP_RECIPIENT_NOT_READY"
          ? "The tip recipient has not finished payout setup yet."
          : msg === "STRIPE_NOT_CONFIGURED"
            ? "Tips are unavailable on this server."
            : msg.startsWith("Tip amount")
              ? msg
              : "Could not start tip checkout.";
    return NextResponse.json({ error: friendly, code: msg }, { status });
  }
}
