import { NextResponse } from "next/server";
import type { LiveShowCarrierPreference, LiveShowShippingMode } from "@/generated/prisma/enums";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import {
  bulkUpdateUnsoldItemProfiles,
  getLiveShowShippingDashboard,
  updateLiveRoomItemShippingProfile,
  updateLiveShowShippingSettings,
} from "@/services/shipping/live-show-shipping";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  const dashboard = await getLiveShowShippingDashboard(liveRoomId);
  if (!dashboard) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json(dashboard);
}

type PatchBody = {
  shippingMode?: LiveShowShippingMode;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
  shippingCapEnabled?: boolean;
  shippingCapCents?: number | null;
  freeShippingEnabled?: boolean;
  sellerPaysOverCap?: boolean;
  carrierPreference?: LiveShowCarrierPreference;
  bundleEligiblePurchases?: boolean;
  confirmFutureOnly?: boolean;
  confirmTermsChange?: boolean;
  itemId?: string;
  itemShippingProfileId?: string | null;
  itemSellerShippingProfileId?: string | null;
  bulkFromProfileId?: string;
  bulkToProfileId?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.bulkFromProfileId?.trim() && body.bulkToProfileId?.trim()) {
    const count = await bulkUpdateUnsoldItemProfiles(
      liveRoomId,
      body.bulkFromProfileId.trim(),
      body.bulkToProfileId.trim(),
    );
    const dashboard = await getLiveShowShippingDashboard(liveRoomId);
    return NextResponse.json({ ok: true, bulkUpdated: count, dashboard });
  }

  if (body.itemId?.trim()) {
    const result = await updateLiveRoomItemShippingProfile(liveRoomId, body.itemId.trim(), {
      shippingProfileId: body.itemShippingProfileId,
      sellerShippingProfileId: body.itemSellerShippingProfileId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const dashboard = await getLiveShowShippingDashboard(liveRoomId);
    return NextResponse.json({ ok: true, item: result.item, dashboard });
  }

  if (!body.confirmFutureOnly) {
    return NextResponse.json(
      {
        error: "Confirm that changes apply to future purchases only.",
        code: "CONFIRM_FUTURE_ONLY_REQUIRED",
      },
      { status: 400 },
    );
  }

  const dashboardBefore = await getLiveShowShippingDashboard(liveRoomId);
  const prevMode = dashboardBefore?.room.shippingMode;
  const prevCap = dashboardBefore?.room.shippingCapCents ?? null;
  const nextMode = body.shippingMode ?? prevMode;
  const nextCap =
    body.shippingCapCents !== undefined ? body.shippingCapCents : prevCap;
  const termsEscalation =
    (prevMode === "capped" || prevMode === "free") &&
    (nextMode === "calculated" || (nextMode === "capped" && nextCap != null && prevCap != null && nextCap > prevCap));

  if (termsEscalation && !body.confirmTermsChange) {
    return NextResponse.json(
      {
        error: "Buyers will see the new shipping terms before their next purchase. Existing purchases are unchanged.",
        code: "CONFIRM_TERMS_CHANGE_REQUIRED",
      },
      { status: 400 },
    );
  }

  await updateLiveShowShippingSettings(liveRoomId, {
    shippingMode: body.shippingMode,
    defaultShippingProfileId: body.defaultShippingProfileId,
    defaultSellerShippingProfileId: body.defaultSellerShippingProfileId,
    shippingCapEnabled: body.shippingCapEnabled,
    shippingCapCents: body.shippingCapCents,
    freeShippingEnabled: body.freeShippingEnabled,
    sellerPaysOverCap: body.sellerPaysOverCap,
    carrierPreference: body.carrierPreference,
    bundleEligiblePurchases: body.bundleEligiblePurchases,
    bumpTermsVersion: true,
  });

  const dashboard = await getLiveShowShippingDashboard(liveRoomId);
  return NextResponse.json({ ok: true, dashboard });
}
