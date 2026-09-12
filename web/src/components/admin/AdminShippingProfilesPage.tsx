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

type EditDraft = {
  name: string;
  defaultWeightOz: string;
  defaultLengthIn: string;
  defaultWidthIn: string;
  defaultHeightIn: string;
  packageType: string;
  bundleAllowed: boolean;
  requiresSeparatePackage: boolean;
  sortOrder: string;
};

function draftFromProfile(p: ProfileRow): EditDraft {
  return {
    name: p.name,
    defaultWeightOz: String(p.defaultWeightOz),
    defaultLengthIn: String(p.defaultLengthIn),
    defaultWidthIn: String(p.defaultWidthIn),
    defaultHeightIn: String(p.defaultHeightIn),
    packageType: p.packageType,
    bundleAllowed: p.bundleAllowed,
    requiresSeparatePackage: p.requiresSeparatePackage,
    sortOrder: String(p.sortOrder),
  };
}

function parsePositiveNumber(raw: string, label: string): number | { error: string } {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { error: `${label} must be a positive number.` };
  return n;
}

export function AdminShippingProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

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
    const ok = window.confirm(
      "Seed defaults overwrites name, dimensions, weight, and bundle settings from code defaults. Continue?",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSavedNote(null);
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
      setEditingId(null);
      setDraft(null);
      await load();
      setSavedNote("Seed defaults applied.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setBusy(true);
    setError(null);
    setSavedNote(null);
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

  const startEdit = (p: ProfileRow) => {
    setError(null);
    setSavedNote(null);
    setEditingId(p.id);
    setDraft(draftFromProfile(p));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;

    const weight = parsePositiveNumber(draft.defaultWeightOz, "Weight");
    if (typeof weight === "object") {
      setError(weight.error);
      return;
    }
    const length = parsePositiveNumber(draft.defaultLengthIn, "Length");
    if (typeof length === "object") {
      setError(length.error);
      return;
    }
    const width = parsePositiveNumber(draft.defaultWidthIn, "Width");
    if (typeof width === "object") {
      setError(width.error);
      return;
    }
    const height = parsePositiveNumber(draft.defaultHeightIn, "Height");
    if (typeof height === "object") {
      setError(height.error);
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isFinite(sortOrder)) {
      setError("Sort order must be a number.");
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const res = await fetch(`/api/admin/shipping-profiles/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultWeightOz: weight,
          defaultLengthIn: length,
          defaultWidthIn: width,
          defaultHeightIn: height,
          packageType: draft.packageType.trim() || "parcel",
          bundleAllowed: draft.bundleAllowed,
          requiresSeparatePackage: draft.requiresSeparatePackage,
          sortOrder: Math.floor(sortOrder),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Update failed.");
        return;
      }
      setEditingId(null);
      setDraft(null);
      await load();
      setSavedNote(
        "Saved. New live quotes and listings that use this profile will pick up the new defaults. Marketplace listings with their own parcel dims keep those until edited.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCommandShell
      title="Platform shipping profiles"
      subtitle="Admin-controlled parcel defaults for Live, Marketplace, and Trade. Edits save to the database immediately."
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
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-zinc-500">
        Changes take effect for new Shippo quotes and fulfillment that read this profile from the DB. Do not use{" "}
        <span className="text-zinc-400">Seed defaults</span> after editing unless you want to overwrite with code
        defaults.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading profiles…</p>
      ) : (
        <section className={`${adminPanelClassName} overflow-x-auto p-4`}>
          <table className="w-full min-w-[820px] text-left text-sm">
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
              {profiles.map((p) => {
                const isEditing = editingId === p.id && draft != null;
                return (
                  <tr key={p.id} className="border-b border-white/[0.04] text-zinc-200 align-top">
                    <td className="py-3 pr-3">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            className="w-full max-w-[200px] rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-zinc-100"
                            aria-label="Profile name"
                          />
                          <p className="font-mono text-xs text-zinc-500">{p.slug}</p>
                          <label className="block text-[10px] uppercase tracking-wide text-zinc-500">
                            Package type
                            <input
                              value={draft.packageType}
                              onChange={(e) => setDraft({ ...draft, packageType: e.target.value })}
                              className="mt-0.5 w-full max-w-[200px] rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-100"
                            />
                          </label>
                          <label className="block text-[10px] uppercase tracking-wide text-zinc-500">
                            Sort order
                            <input
                              value={draft.sortOrder}
                              onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                              className="mt-0.5 w-20 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-100"
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <p className="font-semibold">{p.name}</p>
                          <p className="font-mono text-xs text-zinc-500">{p.slug}</p>
                        </>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <input
                            value={draft.defaultLengthIn}
                            onChange={(e) => setDraft({ ...draft, defaultLengthIn: e.target.value })}
                            className="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-xs text-zinc-100"
                            aria-label="Length inches"
                          />
                          <span className="text-zinc-600">×</span>
                          <input
                            value={draft.defaultWidthIn}
                            onChange={(e) => setDraft({ ...draft, defaultWidthIn: e.target.value })}
                            className="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-xs text-zinc-100"
                            aria-label="Width inches"
                          />
                          <span className="text-zinc-600">×</span>
                          <input
                            value={draft.defaultHeightIn}
                            onChange={(e) => setDraft({ ...draft, defaultHeightIn: e.target.value })}
                            className="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-xs text-zinc-100"
                            aria-label="Height inches"
                          />
                        </div>
                      ) : (
                        <>
                          {p.defaultLengthIn}×{p.defaultWidthIn}×{p.defaultHeightIn}
                        </>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">
                      {isEditing ? (
                        <input
                          value={draft.defaultWeightOz}
                          onChange={(e) => setDraft({ ...draft, defaultWeightOz: e.target.value })}
                          className="w-16 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-xs text-zinc-100"
                          aria-label="Weight ounces"
                        />
                      ) : (
                        p.defaultWeightOz
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draft.bundleAllowed}
                              onChange={(e) => setDraft({ ...draft, bundleAllowed: e.target.checked })}
                            />
                            Bundle allowed
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draft.requiresSeparatePackage}
                              onChange={(e) =>
                                setDraft({ ...draft, requiresSeparatePackage: e.target.checked })
                              }
                            />
                            Separate package
                          </label>
                        </div>
                      ) : (
                        <>
                          {p.bundleAllowed ? "Yes" : "No"}
                          {p.requiresSeparatePackage ? " · separate" : ""}
                        </>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={p.isActive ? "text-emerald-400" : "text-zinc-500"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveEdit()}
                            className="rounded border border-gold/35 bg-gold/10 px-2 py-1 text-xs font-semibold text-gold-bright disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={cancelEdit}
                            className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy || editingId != null}
                            onClick={() => startEdit(p)}
                            className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy || editingId != null}
                            onClick={() => void toggleActive(p.id, p.isActive)}
                            className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
                          >
                            {p.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {savedNote ? <p className="mt-3 text-sm text-emerald-300/90">{savedNote}</p> : null}
    </AdminCommandShell>
  );
}
