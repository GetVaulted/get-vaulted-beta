import { NextResponse } from "next/server";
import { adminReviewListingEndRequest } from "@/lib/listing-end-service";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

type Body = { decision?: string; adminNote?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: requestId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision === "approve" || body.decision === "deny" ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ error: "decision must be approve or deny." }, { status: 400 });
  }

  try {
    const endRequest = await adminReviewListingEndRequest({
      requestId,
      adminUserId: gate.userId,
      decision,
      adminNote: typeof body.adminNote === "string" ? body.adminNote : undefined,
    });
    return NextResponse.json({ endRequest });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Request not found or not pending." }, { status: 404 });
    }
    console.error("[admin/listing-end-requests review]", e);
    return NextResponse.json({ error: "Could not review request." }, { status: 500 });
  }
}
