import { NextResponse } from "next/server";
import {
  retryLiveRoomPaymentFailure,
  syncLiveRoomPaymentFailureAfterSca,
} from "@/lib/live-room-payment-failure";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isBetaDeployment } from "@/lib/is-beta-deployment";

/** Surface diagnostic fields in the retry response only on beta / non-prod, never on real production. */
function recoveryDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || isBetaDeployment();
}

function stripePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
}

type Body = {
  failureId?: unknown;
  action?: unknown;
};

/** Retry payment for an unresolved live-room payment failure (auction win, variant, etc.). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }

  const failureId = typeof body.failureId === "string" ? body.failureId.trim() : undefined;
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "sync") {
    const sync = await syncLiveRoomPaymentFailureAfterSca({
      liveRoomId,
      buyerId: auth.userId,
      failureId,
    });
    if (sync.ok) {
      return NextResponse.json({ ok: true, paid: true, message: "Payment successful. You're all set." });
    }
    return NextResponse.json(
      {
        error: sync.error,
        paymentFailure: sync.paymentFailure,
        paymentFailed: true,
      },
      { status: 402 },
    );
  }

  const result = await retryLiveRoomPaymentFailure({
    liveRoomId,
    buyerId: auth.userId,
    failureId,
  });

  if (result.ok && "paid" in result && result.paid) {
    return NextResponse.json({ ok: true, paid: true, message: "Payment successful. You're all set." });
  }

  if (result.ok && "requiresAction" in result && result.requiresAction) {
    return NextResponse.json({
      ok: true,
      requiresAction: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      publishableKey: stripePublishableKey(),
    });
  }

  if (result.ok && "processing" in result && result.processing) {
    return NextResponse.json({ ok: true, processing: true });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        paymentFailure: result.paymentFailure,
        paymentFailed: true,
        ...(recoveryDebugEnabled() && result.debug ? { debug: result.debug } : {}),
      },
      { status: 402 },
    );
  }

  return NextResponse.json({ error: "Retry could not complete." }, { status: 500 });
}
