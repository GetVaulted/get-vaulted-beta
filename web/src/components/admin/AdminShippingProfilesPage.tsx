"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type ProfileRow = {
  id: string;
  slug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  packageType: string;
  bundleAllowed: boolean;
  requiresSeparatePackage: boolean;
  isActive: boolean;
  sortOrder: number;
};

export function AdminShippingProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shipping-profiles", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load shipping profiles.");
        return;
      }
      const j = (await res.json()) as { profiles?: ProfileRow[] };
      setProfiles(Array.isArray(j.profiles) ? j.profiles : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seedDefaults = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shipping-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedDefaults: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Seed failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shipping-profiles/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Update failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCommandShell
      title="Platform shipping profiles"
      subtitle="Admin-controlled parcel defaults for Live, Marketplace, and Trade."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedDefaults()}
            className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-bright disabled:opacity-40"
          >
            Seed defaults
          </button>
          <Link href="/admin/fees" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
            Fees →
          </Link>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading profiles…</p>
      ) : (
        <section className={`${adminPanelClassName} overflow-x-auto p-4`}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <th className="py-2 pr-3">Profile</th>
                <th className="py-2 pr-3">Dims (in)</th>
                <th className="py-2 pr-3">Weight (oz)</th>
                <th className="py-2 pr-3">Bundle</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.04] text-zinc-200">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="font-mono text-xs text-zinc-500">{p.slug}</p>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">
                    {p.defaultLengthIn}×{p.defaultWidthIn}×{p.defaultHeightIn}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">{p.defaultWeightOz}</td>
                  <td className="py-3 pr-3 text-xs">
                    {p.bundleAllowed ? "Yes" : "No"}
                    {p.requiresSeparatePackage ? " · separate" : ""}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={p.isActive ? "text-emerald-400" : "text-zinc-500"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive(p.id, p.isActive)}
                      className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </AdminCommandShell>
  );
}
