import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import {
  BREAK_FORMATS,
  getLiveRoomHostAccess,
  parseBreakFormat,
  stringifyTeamLabels,
} from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";

type PatchBody = {
  breakDisplayTitle?: string;
  breakFormat?: string;
  breakSpotPriceUsd?: number | null;
  breakTotalSpots?: number | null;
  breakTeamLabels?: string[];
  lockPurchases?: boolean;
  breakPaused?: boolean;
  breakFilledLocked?: boolean;
  /** Admin only: clear assignment lock + randomization fields to allow re-randomize. */
  adminClearAssignmentLock?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.adminClearAssignmentLock === true) {
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Only an admin can clear assignment locks." }, { status: 403 });
    }
    await prisma.liveRoom.update({
      where: { id: liveRoomId },
      data: {
        assignmentsLockedAt: null,
        randomizedAt: null,
        randomizationSeed: null,
        randomizationPreviewJson: null,
        randomizationResultJson: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.breakDisplayTitle === "string") {
    data.breakDisplayTitle = body.breakDisplayTitle.trim().slice(0, 200);
  }
  if (typeof body.breakFormat === "string") {
    const f = parseBreakFormat(body.breakFormat.trim());
    if (!f) return NextResponse.json({ error: `Invalid breakFormat. Use one of: ${BREAK_FORMATS.join(", ")}` }, { status: 400 });
    if (access.room.assignmentsLockedAt && !access.isAdmin) {
      return NextResponse.json({ error: "Assignments are locked; cannot change format." }, { status: 409 });
    }
    data.breakFormat = f;
  }
  if ("breakSpotPriceUsd" in body) {
    if (body.breakSpotPriceUsd == null) data.breakSpotPriceUsd = null;
    else if (typeof body.breakSpotPriceUsd === "number" && Number.isFinite(body.breakSpotPriceUsd) && body.breakSpotPriceUsd >= 0) {
      data.breakSpotPriceUsd = body.breakSpotPriceUsd;
    }
  }
  if ("breakTotalSpots" in body) {
    if (body.breakTotalSpots == null) data.breakTotalSpots = null;
    else if (typeof body.breakTotalSpots === "number" && Number.isFinite(body.breakTotalSpots) && body.breakTotalSpots >= 0) {
      data.breakTotalSpots = Math.floor(body.breakTotalSpots);
    }
  }
  if (Array.isArray(body.breakTeamLabels)) {
    if (access.room.assignmentsLockedAt && !access.isAdmin) {
      return NextResponse.json({ error: "Assignments are locked; cannot change team labels." }, { status: 409 });
    }
    data.breakTeamLabelsJson = stringifyTeamLabels(body.breakTeamLabels);
  }
  if (typeof body.lockPurchases === "boolean") data.lockPurchases = body.lockPurchases;
  if (typeof body.breakPaused === "boolean") data.breakPaused = body.breakPaused;
  if (body.breakFilledLocked === true) {
    data.breakFilledLockedAt = new Date();
  }
  if (body.breakFilledLocked === false) {
    data.breakFilledLockedAt = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid updates." }, { status: 400 });
  }

  await prisma.liveRoom.update({ where: { id: liveRoomId }, data: data as object });
  return NextResponse.json({ ok: true });
}
