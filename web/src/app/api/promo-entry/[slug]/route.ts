import { NextResponse } from "next/server";
import { getGiveawayByAmoeSlug, submitAmoeGiveawayEntry } from "@/lib/live-giveaway";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { emitLiveRoomGiveawaysChanged } from "@/lib/realtime-emit-server";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw);
  const promo = await getGiveawayByAmoeSlug(slug);
  if (!promo) {
    return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  }
  return NextResponse.json({ promo });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw);

  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: { fullName?: string; email?: string; mailingAddress?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const promo = await getGiveawayByAmoeSlug(slug);
  if (!promo) {
    return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  }

  const result = await submitAmoeGiveawayEntry({
    rulesSlug: slug,
    userId: auth.userId,
    fullName: typeof body.fullName === "string" ? body.fullName : "",
    email: typeof body.email === "string" ? body.email : "",
    mailingAddress: typeof body.mailingAddress === "string" ? body.mailingAddress : "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  emitLiveRoomGiveawaysChanged(promo.liveRoomId);
  return NextResponse.json({ ok: true });
}
