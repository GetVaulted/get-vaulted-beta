import { NextResponse } from "next/server";
import { createOffPlatformPlatformFeeCheckout } from "@/lib/off-platform-platform-fee-checkout";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";

/**
 * Host pays Get Vaulted the live platform fee for an off-platform mark-sold sale.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; purchaseId: string }> },
) {
  const { id: rawRoom, purchaseId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  const result = await createOffPlatformPlatformFeeCheckout({
    purchaseId,
    sellerUserId: hostAuth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.alreadyPaid) {
    return NextResponse.json({
      ok: true,
      alreadyPaid: true,
      feeCents: result.feeCents,
      feeUsd: result.feeUsd,
      url: null,
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyPaid: false,
    feeCents: result.feeCents,
    feeUsd: result.feeUsd,
    url: result.url,
  });
}
