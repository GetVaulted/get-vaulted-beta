import { NextResponse } from "next/server";
import {
  getAdminUserPlatformCreditSnapshot,
  grantAdminPlatformCredit,
} from "@/lib/admin/admin-platform-credit-grant";
import { releaseAllReservedPlatformCreditForUser } from "@/lib/giveaway/platform-credit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/** GET — a user's Get Vaulted Credit balance + ledger, for the admin user detail page. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await getAdminUserPlatformCreditSnapshot(id);
  return NextResponse.json(snapshot);
}

type Body = { amountUsd?: unknown; reason?: unknown; action?: unknown };

/** POST — admin grants Get Vaulted Credit to this user, or releases stuck reservations. Reason is required for grants and logged. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "release_stuck") {
    const { releasedCount } = await releaseAllReservedPlatformCreditForUser(id);
    const snapshot = await getAdminUserPlatformCreditSnapshot(id);
    return NextResponse.json({ ...snapshot, releasedCount });
  }

  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }
  if (!Number.isFinite(amountUsd) || amountUsd < 0.01) {
    return NextResponse.json({ error: "Enter an amount of at least $0.01." }, { status: 400 });
  }
  if (amountUsd > 5000) {
    return NextResponse.json({ error: "Grants over $5,000 require a manual database change — ask an engineer." }, { status: 400 });
  }

  try {
    await grantAdminPlatformCredit({ userId: id, amountUsd, reason, adminId: gate.userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Grant failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const snapshot = await getAdminUserPlatformCreditSnapshot(id);
  return NextResponse.json(snapshot);
}
