import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  SELLER_APPLICATION_LIMITS,
  actionRequiresNote,
  nextStatusForAction,
  type SellerApplicationAction,
} from "@/lib/seller-application";
import { notifySellerApplicationDecision } from "@/lib/seller-application-notify";

export const dynamic = "force-dynamic";

const ACTIONS: SellerApplicationAction[] = ["approve", "reject", "request_info", "revoke"];

/** POST { action: approve | reject | request_info | revoke, note? } — decide on one application. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const applicationId = decodeURIComponent(id);

  let body: { action?: string; note?: string };
  try {
    body = (await req.json()) as { action?: string; note?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action as SellerApplicationAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, SELLER_APPLICATION_LIMITS.adminNote.max) : "";
  if (actionRequiresNote(action) && !note) {
    return NextResponse.json({ error: "Add a message for the seller." }, { status: 400 });
  }

  const current = await prisma.sellerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true, status: true },
  });
  if (!current) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const next = nextStatusForAction(current.status, action);
  if (!next) {
    return NextResponse.json(
      { error: `Can't ${action.replace("_", " ")} an application that is ${current.status.replace("_", " ")}.` },
      { status: 409 },
    );
  }

  // Compare-and-set on the status we read, so two admins can't both act on the same state.
  const updated = await prisma.sellerApplication.updateMany({
    where: { id: current.id, status: current.status },
    data: {
      status: next,
      adminNote: action === "approve" ? note || null : note,
      reviewedById: gate.userId,
      reviewedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Someone else just updated this application. Refresh and try again." }, { status: 409 });
  }

  await notifySellerApplicationDecision({ userId: current.userId, action, note });

  // For a revoke: tell the admin what this seller still has live so they can clean it up.
  let stillLive: { activeListings: number; upcomingShows: number } | undefined;
  if (action === "revoke") {
    const [activeListings, upcomingShows] = await Promise.all([
      prisma.listing.count({ where: { sellerId: current.userId, status: "active" } }),
      prisma.liveRoom.count({ where: { sellerId: current.userId, status: { in: ["scheduled", "live"] } } }),
    ]);
    stillLive = { activeListings, upcomingShows };
  }

  return NextResponse.json({ ok: true, status: next, stillLive });
}
