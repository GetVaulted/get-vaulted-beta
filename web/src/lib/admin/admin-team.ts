import { ADMIN_ROLES, resolveAdminRole, type AdminRole } from "@/lib/admin/admin-permissions";

export type TeamChange =
  | { kind: "set_role"; role: AdminRole }
  | { kind: "promote"; role: AdminRole }
  | { kind: "remove" };

export type TeamValidation = { ok: true } | { ok: false; error: string };

/**
 * Pure safety rules for team changes. `ownerCount` counts active owners (null adminRole counts as owner).
 */
export function validateTeamChange(input: {
  actorId: string;
  targetId: string;
  targetIsAdmin: boolean;
  targetCurrentRole: string | null;
  ownerCount: number;
  change: TeamChange;
}): TeamValidation {
  const { actorId, targetId, targetIsAdmin, targetCurrentRole, ownerCount, change } = input;
  if (change.kind === "promote") {
    if (targetIsAdmin) return { ok: false, error: "ALREADY_ADMIN" };
    if (!(ADMIN_ROLES as readonly string[]).includes(change.role)) return { ok: false, error: "BAD_ROLE" };
    return { ok: true };
  }
  if (!targetIsAdmin) return { ok: false, error: "NOT_ADMIN" };
  if (actorId === targetId) return { ok: false, error: "CANNOT_CHANGE_SELF" };
  const wasOwner = resolveAdminRole(targetCurrentRole) === "owner";
  if (change.kind === "set_role") {
    if (!(ADMIN_ROLES as readonly string[]).includes(change.role)) return { ok: false, error: "BAD_ROLE" };
    if (wasOwner && change.role !== "owner" && ownerCount <= 1) return { ok: false, error: "LAST_OWNER" };
    return { ok: true };
  }
  if (wasOwner && ownerCount <= 1) return { ok: false, error: "LAST_OWNER" };
  return { ok: true };
}
