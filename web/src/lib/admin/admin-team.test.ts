import { describe, expect, it } from "vitest";
import { validateTeamChange } from "./admin-team";

const base = { actorId: "a", targetId: "b", targetIsAdmin: true, targetCurrentRole: "support", ownerCount: 2 };

describe("validateTeamChange", () => {
  it("lets an owner change another admin's role", () => {
    expect(validateTeamChange({ ...base, change: { kind: "set_role", role: "finance" } }).ok).toBe(true);
  });
  it("blocks changing yourself", () => {
    expect(validateTeamChange({ ...base, targetId: "a", change: { kind: "remove" } })).toEqual({ ok: false, error: "CANNOT_CHANGE_SELF" });
  });
  it("blocks demoting or removing the last owner", () => {
    const last = { ...base, targetCurrentRole: null, ownerCount: 1 };
    expect(validateTeamChange({ ...last, change: { kind: "set_role", role: "support" } })).toEqual({ ok: false, error: "LAST_OWNER" });
    expect(validateTeamChange({ ...last, change: { kind: "remove" } })).toEqual({ ok: false, error: "LAST_OWNER" });
  });
  it("promotes a non-admin and rejects bad roles", () => {
    expect(validateTeamChange({ ...base, targetIsAdmin: false, change: { kind: "promote", role: "moderator" } }).ok).toBe(true);
    expect(validateTeamChange({ ...base, targetIsAdmin: false, change: { kind: "promote", role: "root" as never } })).toEqual({ ok: false, error: "BAD_ROLE" });
    expect(validateTeamChange({ ...base, change: { kind: "promote", role: "support" } })).toEqual({ ok: false, error: "ALREADY_ADMIN" });
  });
});
