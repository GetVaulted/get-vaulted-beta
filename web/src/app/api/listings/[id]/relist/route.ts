import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { relistAfterExpiredAuction } from "@/services/auction-recovery";

export const runtime = "nodejs";

type Body = { targetStatus?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ts = body.targetStatus === "draft" || body.targetStatus === "active" ? body.targetStatus : null;
  if (!ts) {
    return NextResponse.json({ error: "targetStatus must be \"draft\" or \"active\"." }, { status: 400 });
  }

  const actorIsAdmin = session.user.role === "admin";

  try {
    await relistAfterExpiredAuction({
      listingId,
      actorUserId: session.user.id,
      actorIsAdmin,
      targetStatus: ts,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: "Not found." },
      FORBIDDEN: { status: 403, msg: "Forbidden." },
      INVALID_STATUS: { status: 409, msg: "Relist is only available after winner payment expired." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg, code: msg }, { status: hit.status });
    if (msg === "SELLER_REQUIREMENTS_INCOMPLETE") {
      const issues = (e as Error & { issues?: string[] }).issues ?? [];
      return NextResponse.json(
        {
          error: "SELLER_REQUIREMENTS_INCOMPLETE",
          issues,
        },
        { status: 403 },
      );
    }
    console.error("[listings/relist]", e);
    return NextResponse.json({ error: "Could not relist." }, { status: 500 });
  }
}
