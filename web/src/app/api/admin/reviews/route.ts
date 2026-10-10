import { NextResponse } from "next/server";
import { listAdminReviews, type ReviewState } from "@/lib/admin/admin-content-moderation";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const sp = new URL(request.url).searchParams;
  const state = (["visible", "hidden", "all"].includes(sp.get("state") ?? "") ? sp.get("state") : "all") as ReviewState;
  const maxRating = Number(sp.get("maxRating"));
  const reviews = await listAdminReviews({
    q: sp.get("q") ?? "",
    state,
    maxRating: Number.isInteger(maxRating) && maxRating >= 1 && maxRating <= 5 ? maxRating : undefined,
  });
  return NextResponse.json({ reviews });
}
