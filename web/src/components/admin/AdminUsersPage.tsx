"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Row = {
  id: string;
  email: string;
  username: string;
  role: string;
  suspendedAt: string | null;
  createdAt: string;
};

export function AdminUsersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (applied.trim()) sp.set("q", applied.trim());
      const res = await fetch(`/api/admin/users?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { users?: Row[] };
      setRows(Array.isArray(j.users) ? j.users : []);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        await load();
        router.refresh();
      } else {
        setActionError(typeof data.error === "string" ? data.error : "Action failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 lg:px-10">
      <h1 className="font-display text-xl font-black tracking-tight">Users</h1>
      <p className="mt-1 text-xs text-zinc-500">Search by email or username substring.</p>
      {actionError ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{actionError}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setApplied(q);
            }}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="email or @username"
          />
        </label>
        <button
          type="button"
          onClick={() => setApplied(q)}
          className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-bright hover:bg-gold/15"
        >
          Search
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-zinc-500">
                  No users found.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const self = session?.user?.id === r.id;
                return (
                  <tr key={r.id} className="border-b border-white/[0.05] text-zinc-300">
                    <td className="px-3 py-2 align-top">
                      <span className="font-medium text-zinc-100">@{r.username}</span>
                      <p className="text-[10px] text-zinc-500">{r.email}</p>
                      <p className="font-mono text-[10px] text-zinc-600">{r.id}</p>
                    </td>
                    <td className="px-3 py-2 align-top capitalize">{r.role}</td>
                    <td className="px-3 py-2 align-top">
                      {r.suspendedAt ? <span className="text-rose-400">Suspended</span> : <span className="text-zinc-500">Active</span>}
                    </td>
                    <td className="px-3 py-2 align-top text-[10px] text-zinc-600">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {self ? (
                        <span className="text-[10px] text-zinc-600">—</span>
                      ) : r.suspendedAt ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, "unsuspend")}
                          className="rounded border border-white/15 px-2 py-1 text-[10px] font-semibold text-zinc-200 hover:border-gold/30"
                        >
                          {busyId === r.id ? "Working…" : "Unsuspend"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void act(r.id, "suspend")}
                          className="rounded border border-rose-500/40 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                        >
                          {busyId === r.id ? "Working…" : "Suspend"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
