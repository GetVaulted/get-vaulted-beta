"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminSelectClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";

type Admin = { id: string; username: string; email: string; adminRole: string | null; effectiveRole: string; suspendedAt: string | null };

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including this page.",
  finance: "Refunds (any size), payouts, disputes, order shipping fixes.",
  support: "Refunds up to $100, order fixes, spot fixes, move shows, message members.",
  moderator: "Reviews, chat, reports, listings, suspend members, seller applications.",
};

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: "Add a reason (at least 5 characters).",
  CANNOT_CHANGE_SELF: "You cannot change your own access. Ask another owner.",
  LAST_OWNER: "There must always be at least one owner.",
  USER_NOT_FOUND: "No member with that username.",
  ALREADY_ADMIN: "That member is already on the team.",
};

export function AdminTeamPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [username, setUsername] = useState("");
  const [newRole, setNewRole] = useState("support");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/team", { cache: "no-store" });
    if (!res.ok) {
      setMsg("You do not have access to team settings.");
      return;
    }
    const data = (await res.json()) as { admins: Admin[]; roles: string[] };
    setAdmins(data.admins);
    setRoles(data.roles);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(payload: Record<string, unknown>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg("Saved.");
        setReason("");
        setUsername("");
        await load();
      } else setMsg(ERRORS[data.error ?? ""] ?? data.error ?? "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCommandShell title="Team & permissions" subtitle="Who can do what in the admin console. Every change is logged with your reason.">
      <section className={`${adminPanelClassName} p-4 text-xs`}>
        <label htmlFor="team-reason" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Reason for the next change
        </label>
        <input
          id="team-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. New support hire starting Monday"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
        />
        {msg ? <p className="mt-2 text-gold-bright">{msg}</p> : null}
      </section>

      <div className={`${adminPanelClassName} mt-4 overflow-x-auto`}>
        <table className={adminTableClassName}>
          <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Can do</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-t border-white/[0.05] align-top">
                <td>
                  @{a.username}
                  <div className="text-zinc-600">{a.email}</div>
                </td>
                <td>
                  <select
                    aria-label={`Role for ${a.username}`}
                    className={adminSelectClassName}
                    value={a.effectiveRole}
                    disabled={busy}
                    onChange={(e) =>
                      void act({ action: "set_role", userId: a.id, role: e.target.value }, `Change @${a.username} to ${e.target.value}?`)
                    }
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="max-w-xs text-zinc-400">{ROLE_HELP[a.effectiveRole] ?? "No access (unknown role)."}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-red-400 hover:underline"
                    onClick={() => void act({ action: "remove", userId: a.id }, `Remove @${a.username} from the admin team?`)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={`${adminPanelClassName} mt-4 p-4 text-xs`}>
        <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Add a team member</h2>
        <p className="mt-2 text-zinc-500">They must already have a Get Vaulted account. Enter their username.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          />
          <select aria-label="Role" className={adminSelectClassName} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !username.trim()}
            className={adminButtonPrimaryClassName}
            onClick={() => void act({ action: "promote", username, role: newRole }, `Give @${username.replace(/^@/, "")} admin access as ${newRole}?`)}
          >
            Add to team
          </button>
        </div>
      </section>
    </AdminCommandShell>
  );
}
