import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { chargeLiveTipWithSavedPaymentMethod, createLiveTipCheckoutSession } from "@/services/live-tips";

type PostBody = {
  amountUsd?: unknown;
  message?: unknown;
  paymentMethodId?: unknown;
  /** Legacy Stripe Checkout redirect — used only when saved-card charge is unavailable. */
  useCheckout?: unknown;
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
  const paymentMethodId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;
  const useCheckout = body.useCheckout === true;

  if (useCheckout) {
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

  const result = await chargeLiveTipWithSavedPaymentMethod({
    userId: auth.userId,
    liveRoomId,
    amountUsd: amountRaw,
    message,
    paymentMethodId,
  });

  if (result.outcome === "paid") {
    return NextResponse.json({ paid: true, liveTipId: result.liveTipId, paymentIntentId: result.paymentIntentId });
  }
  if (result.outcome === "requires_action") {
    return NextResponse.json({
      requiresAction: true,
      liveTipId: result.liveTipId,
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      publishableKey: result.publishableKey,
    });
  }

  const status =
    result.code === "ROOM_NOT_FOUND"
      ? 404
      : result.code === "ROOM_NOT_LIVE"
        ? 409
        : result.code === "TIP_RECIPIENT_NOT_READY" || result.code === "STRIPE_NOT_CONFIGURED"
          ? 503
          : result.code === "LIVE_BUYER_WALLET_INCOMPLETE" || result.code === "NO_SAVED_CARD"
            ? 402
            : result.code === "HOST_CANNOT_TIP"
              ? 400
              : 402;

  return NextResponse.json({ error: result.message, code: result.code, paymentFailed: status === 402 }, { status });
}
