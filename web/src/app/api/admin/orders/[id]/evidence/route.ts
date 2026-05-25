import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { generateDisputeEvidenceBundle, getDisputeEvidenceBundle } from "@/lib/trust/dispute-evidence";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const orderId = decodeURIComponent(id);

  try {
    const { id: bundleId, summary } = await generateDisputeEvidenceBundle({
      orderId,
      adminUserId: gate.userId,
    });
    return NextResponse.json({ ok: true, bundleId, summary });
  } catch (e) {
    console.error("[admin evidence]", e);
    return NextResponse.json({ error: "Evidence generation failed." }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const bundleId = url.searchParams.get("bundleId")?.trim();
  if (!bundleId) {
    return NextResponse.json({ error: "bundleId query required." }, { status: 400 });
  }

  const bundle = await getDisputeEvidenceBundle(bundleId);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ bundle });
}
