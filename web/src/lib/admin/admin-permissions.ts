import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const ADMIN_ROLES = ["owner", "finance", "support", "moderator"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "refunds.decide"
  | "refunds.force"
  | "payouts.manage"
  | "orders.fulfill"
  | "disputes.manage"
  | "shows.move"
  | "spots.fix"
  | "users.suspend"
  | "users.message"
  | "content.moderate"
  | "sellers.approve"
  | "settings.manage"
  | "team.manage";

const ALL: AdminPermission[] = [
  "refunds.decide",
  "refunds.force",
  "payouts.manage",
  "orders.fulfill",
  "disputes.manage",
  "shows.move",
  "spots.fix",
  "users.suspend",
  "users.message",
  "content.moderate",
  "sellers.approve",
  "settings.manage",
  "team.manage",
];

const PERMISSIONS_BY_ROLE: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  owner: new Set(ALL),
  finance: new Set<AdminPermission>([
    "refunds.decide",
    "refunds.force",
    "payouts.manage",
    "disputes.manage",
    "orders.fulfill",
  ]),
  support: new Set<AdminPermission>([
    "refunds.decide",
    "orders.fulfill",
    "spots.fix",
    "users.message",
    "shows.move",
  ]),
  moderator: new Set<AdminPermission>(["content.moderate", "users.suspend", "users.message", "sellers.approve"]),
};

/** Support staff may approve refunds only up to this amount (cents); larger needs finance/owner. */
export const SUPPORT_REFUND_CAP_CENTS = 10_000;

/** NULL (existing admins) = owner. An unknown string gets no permissions (least privilege). */
export function resolveAdminRole(raw: string | null | undefined): AdminRole | null {
  if (raw == null || raw === "") return "owner";
  return (ADMIN_ROLES as readonly string[]).includes(raw) ? (raw as AdminRole) : null;
}

export function roleHasPermission(role: AdminRole | null, permission: AdminPermission): boolean {
  if (!role) return false;
  return PERMISSIONS_BY_ROLE[role].has(permission);
}

export function roleCanApproveRefundAmount(role: AdminRole | null, amountCents: number): boolean {
  if (!role) return false;
  if (role === "support") return amountCents <= SUPPORT_REFUND_CAP_CENTS;
  return roleHasPermission(role, "refunds.decide");
}

export type RequireAdminPermissionResult =
  | { ok: true; userId: string; role: AdminRole }
  | { ok: false; response: NextResponse };

/** Admin gate + permission check. Drop-in replacement for requireAdmin on risky routes. */
export async function requireAdminPermission(
  permission: AdminPermission,
  request?: Request,
): Promise<RequireAdminPermissionResult> {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate;
  const row = await prisma.user.findUnique({ where: { id: gate.userId }, select: { adminRole: true } });
  const role = resolveAdminRole(row?.adminRole);
  if (!roleHasPermission(role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Your admin role does not allow this action (${permission}).` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: gate.userId, role: role as AdminRole };
}
