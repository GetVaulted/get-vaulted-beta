import { NextResponse } from "next/server";
import { logAdminAction, normalizeAdminReason } from "@/lib/admin/admin-audit";
import { ADMIN_ROLES, requireAdminPermission, resolveAdminRole, type AdminRole } from "@/lib/admin/admin-permissions";
import { validateTeamChange, type TeamChange } from "@/lib/admin/admin-team";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const gate = await requireAdminPermission("team.manage", request);
  if (!gate.ok) return gate.response;
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, username: true, email: true, adminRole: true, suspendedAt: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json({
    admins: admins.map((a) => ({ ...a, effectiveRole: resolveAdminRole(a.adminRole) ?? "none" })),
    roles: ADMIN_ROLES,
  });
}

/** Body: { action: "set_role" | "promote" | "remove", userId?, username?, role?, reason } */
export async function POST(request: Request) {
  const gate = await requireAdminPermission("team.manage", request);
  if (!gate.ok) return gate.response;

  let body: { action?: string; userId?: string; username?: string; role?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });

  const target = body.userId
    ? await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true, adminRole: true, username: true } })
    : body.username
      ? await prisma.user.findFirst({
          where: { username: { equals: body.username.replace(/^@/, "").trim(), mode: "insensitive" } },
          select: { id: true, role: true, adminRole: true, username: true },
        })
      : null;
  if (!target) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  let change: TeamChange;
  if (body.action === "remove") change = { kind: "remove" };
  else if (body.action === "set_role") change = { kind: "set_role", role: body.role as AdminRole };
  else if (body.action === "promote") change = { kind: "promote", role: body.role as AdminRole };
  else return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });

  const owners = await prisma.user.findMany({
    where: { role: "admin", suspendedAt: null },
    select: { adminRole: true },
  });
  const ownerCount = owners.filter((o) => resolveAdminRole(o.adminRole) === "owner").length;

  const check = validateTeamChange({
    actorId: gate.userId,
    targetId: target.id,
    targetIsAdmin: target.role === "admin",
    targetCurrentRole: target.adminRole,
    ownerCount,
    change,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    if (change.kind === "remove") {
      await tx.user.update({ where: { id: target.id }, data: { role: "user", adminRole: null } });
    } else if (change.kind === "promote") {
      await tx.user.update({ where: { id: target.id }, data: { role: "admin", adminRole: change.role } });
    } else {
      await tx.user.update({ where: { id: target.id }, data: { adminRole: change.role } });
    }
    await logAdminAction(
      {
        adminUserId: gate.userId,
        action: `team.${change.kind}`,
        targetType: "user",
        targetId: target.id,
        targetUserId: target.id,
        reason,
        detail: { from: target.adminRole ?? (target.role === "admin" ? "owner" : null), to: change.kind === "remove" ? null : change.role },
      },
      tx,
    );
  });
  return NextResponse.json({ ok: true });
}
