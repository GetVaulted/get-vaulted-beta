import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { createLayawayBalanceCheckout } from "@/services/layaway";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

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
      buyerId: auth.userId,
      amountUsd,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      LAYAWAY_DEPOSIT_PENDING: {
        status: 409,
        msg: "Complete your deposit checkout before making balance payments.",
      },
      LAYAWAY_NOT_ACTIVE: { status: 409, msg: "This layaway is not active for payments." },
      NOTHING_DUE: { status: 400, msg: "No balance is due on this layaway." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg }, { status: hit.status });
    console.error("[layaway pay]", e);
    return NextResponse.json({ error: "Could not start payment." }, { status: 500 });
  }
}
