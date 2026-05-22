import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveAuthUserForToken } from "@/lib/auth-resolve-user";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

function usernameFromEmail(email: string): string {
  const local = email.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() ?? "seller";
  const cleaned = local.replace(/_+/g, "_").replace(/^_|_$/g, "");
  return (cleaned.length >= 3 ? cleaned : "seller").slice(0, 20);
}

async function allocateUsername(base: string): Promise<string> {
  const stem = base.slice(0, 17);
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? stem : `${stem}_${i}`.slice(0, 20);
    if (candidate.length < 3) continue;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `u_${Date.now()}`.slice(0, 20);
}

/**
 * Resolves the Prisma seller id for `/api/account/seller`.
 * Re-binds stale JWT subs via email; optionally auto-creates a minimal User for QA when missing.
 */
export async function resolveAccountSellerUserId(
  req: Request,
): Promise<{ userId: string; provisioned?: boolean } | NextResponse> {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const byId = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });
  if (byId) return { userId: byId.id };

  const session = await getServerSessionSafe();
  const resolved = await resolveAuthUserForToken({
    tokenSub: auth.userId,
    tokenEmail: session?.user?.email ?? undefined,
  });
  if (resolved.ok) {
    return { userId: resolved.user.id };
  }

  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      {
        error:
          "Your session does not match any user in this database. Sign out and sign in again (common after switching which Postgres database the app uses).",
        code: "SESSION_USER_MISSING",
      },
      { status: 404 },
    );
  }

  const autoProvision =
    process.env.GV_AUTO_PROVISION_SELLER_USER?.trim() === "1" ||
    process.env.ALLOW_BETA_QA_SEED?.trim() === "1";

  if (!autoProvision) {
    return NextResponse.json(
      {
        error:
          "Your session does not match any user in this database. Sign out and sign in again (common after switching which Postgres database the app uses).",
        code: "SESSION_USER_MISSING",
        detail: `No User row for session id ${auth.userId} or email ${email}.`,
      },
      { status: 404 },
    );
  }

  const username = await allocateUsername(usernameFromEmail(email));
  try {
    const created = await prisma.user.create({
      data: {
        id: auth.userId,
        email,
        username,
        emailVerified: new Date(),
      },
    });
    console.info("[resolveAccountSellerUserId] auto-provisioned User", { id: created.id, email });
    return { userId: created.id, provisioned: true };
  } catch {
    const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (byEmail) return { userId: byEmail.id };
    return NextResponse.json(
      {
        error: "Could not create seller profile for this session.",
        code: "SELLER_USER_PROVISION_FAILED",
      },
      { status: 503 },
    );
  }
}
