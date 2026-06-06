import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { createLayawayBalanceCheckout } from "@/services/layaway";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  let body: { amountUsd?: number; payRemaining?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* optional body */
  }

  try {
    const amountUsd =
      body.payRemaining === true
        ? undefined
        : typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd)
          ? body.amountUsd
          : undefined;
    const { url } = await createLayawayBalanceCheckout({
      layawayId: decodeURIComponent(id),
      buyerId: session.user.id,
      amountUsd,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      LAYAWAY_NOT_ACTIVE: { status: 409, msg: "This layaway is not active." },
      NOTHING_DUE: { status: 400, msg: "No balance is due on this layaway." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg }, { status: hit.status });
    console.error("[layaway pay]", e);
    return NextResponse.json({ error: "Could not start payment." }, { status: 500 });
  }
}
