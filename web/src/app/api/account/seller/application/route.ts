import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import {
  applicantCanSubmit,
  validateSellerApplicationInput,
  type SellerApprovalState,
} from "@/lib/seller-application";
import { notifyAdminsSellerApplication } from "@/lib/seller-application-notify";
import { getSellerApprovalState, isSellerApplicationsEnforced } from "@/lib/seller-approval";

export const dynamic = "force-dynamic";

async function snapshot(userId: string) {
  const [state, row] = await Promise.all([
    getSellerApprovalState(userId),
    prisma.sellerApplication.findUnique({
      where: { userId },
      select: {
        status: true,
        whatTheySell: true,
        whereTheySellNow: true,
        experience: true,
        monthlyVolume: true,
        adminNote: true,
        submittedAt: true,
        reviewedAt: true,
      },
    }),
  ]);
  return {
    enforced: isSellerApplicationsEnforced(),
    status: state as SellerApprovalState,
    canSubmit: applicantCanSubmit(state),
    application: row
      ? {
          ...row,
          submittedAt: row.submittedAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
        }
      : null,
  };
}

/** GET — the signed-in member's seller application and approval status. */
export async function GET(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  return NextResponse.json(await snapshot(resolved.userId));
}

/** POST — submit a new application, or answer an "info requested" with updated answers. */
export async function POST(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const userId = resolved.userId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = validateSellerApplicationInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, suspendedAt: true, accountDeletedAt: true },
  });
  if (!me || me.accountDeletedAt) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (me.suspendedAt) return NextResponse.json({ error: "This account is suspended." }, { status: 403 });

  const state = await getSellerApprovalState(userId);
  if (!applicantCanSubmit(state)) {
    return NextResponse.json(
      { error: "Your application can't be changed right now.", status: state },
      { status: 409 },
    );
  }

  const now = new Date();
  const data = {
    ...parsed.value,
    status: "pending" as const,
    adminNote: null,
    reviewedById: null,
    reviewedAt: null,
    submittedAt: now,
  };
  const saved = await prisma.sellerApplication.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { id: true },
  });

  notifyAdminsSellerApplication({
    applicationId: saved.id,
    username: me.username,
    submittedAt: now,
    resubmitted: state === "info_requested",
  });

  return NextResponse.json(await snapshot(userId));
}
