import { NextResponse } from "next/server";
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
  defaultShippingProfileId?: string | null;
  shippingCapEnabled?: boolean;
  shippingCapCents?: number | null;
  freeShippingEnabled?: boolean;
  sellerPaysOverCap?: boolean;
  itemId?: string;
  itemShippingProfileId?: string | null;
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
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const dashboard = await getLiveShowShippingDashboard(liveRoomId);
    return NextResponse.json({ ok: true, item: result.item, dashboard });
  }

  await updateLiveShowShippingSettings(liveRoomId, {
    defaultShippingProfileId: body.defaultShippingProfileId,
    shippingCapEnabled: body.shippingCapEnabled,
    shippingCapCents: body.shippingCapCents,
    freeShippingEnabled: body.freeShippingEnabled,
    sellerPaysOverCap: body.sellerPaysOverCap,
  });

  const dashboard = await getLiveShowShippingDashboard(liveRoomId);
  return NextResponse.json({ ok: true, dashboard });
}
