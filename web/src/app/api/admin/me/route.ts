import { NextResponse } from "next/server";
import { ADMIN_ROLES, resolveAdminRole, roleHasPermission, type AdminPermission } from "@/lib/admin/admin-permissions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/** Lightweight admin probe for mobile Ops gate (Bearer or cookie). Also reports the admin sub-role. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const row = await prisma.user.findUnique({ where: { id: gate.userId }, select: { adminRole: true } });
  const role = resolveAdminRole(row?.adminRole);
  return NextResponse.json({
    isAdmin: true,
    userId: gate.userId,
    adminRole: role,
    knownRoles: ADMIN_ROLES,
    canManageTeam: roleHasPermission(role, "team.manage" as AdminPermission),
  });
}
