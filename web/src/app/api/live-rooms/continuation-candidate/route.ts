import { NextResponse } from "next/server";
import type { LiveRoomType } from "@/generated/prisma/client";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { findLiveRoomContinuationCandidate } from "@/lib/live-room-continuation";

const ROOM_TYPES: LiveRoomType[] = ["auction", "sale", "break"];

/**
 * Lets the seller's "go live" screen ask, before creating a new show: "is this continuing a show
 * you ended recently?" Returns the most recent eligible candidate (same seller, same roomType,
 * ended within the last 24h) for the seller to confirm via a toggle — or null if there isn't one.
 * Never links anything by itself; see `POST /api/live-rooms` for where a seller-confirmed
 * `continuationOfLiveRoomId` is re-validated and actually applied.
 */
export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const sellerId = auth.userId;

  const { searchParams } = new URL(req.url);
  const roomTypeRaw = (searchParams.get("roomType") ?? "").trim();
  if (!ROOM_TYPES.includes(roomTypeRaw as LiveRoomType)) {
    return NextResponse.json({ error: "Invalid or missing roomType." }, { status: 400 });
  }
  const roomType = roomTypeRaw as LiveRoomType;

  try {
    const candidate = await findLiveRoomContinuationCandidate({ sellerId, roomType });
    return NextResponse.json({ candidate }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("[api GET /api/live-rooms/continuation-candidate] failed", { sellerId, roomType, e });
    return NextResponse.json({ candidate: null });
  }
}
