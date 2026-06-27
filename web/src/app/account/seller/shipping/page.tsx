"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProfileRow = {
  id: string;
  sourceSlug: string;
  name: string;
  defaultWeightOz: number;
  defaultLengthIn: number;
  defaultWidthIn: number;
  defaultHeightIn: number;
  bundleGroup: string;
  maxUnitsPerParcel: number | null;
  requiresSeparatePackage: boolean;
  canJoinBuyerShowShipment: boolean;
  carrierPreference: string;
  isDefault: boolean;
};

export default function SellerShippingProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/seller/shipping-profiles", { cache: "no-store" });
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

  const setDefault = async (profileId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/seller/shipping-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_default", profileId }),
      });
      if (!res.ok) {
        setError("Could not set default profile.");
        return;
      }
      setMessage("Default profile updated.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const archive = async (profileId: string) => {
    if (!window.confirm("Archive this profile? It stays on past sales but won't appear for new shows.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/seller/shipping-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", profileId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not archive profile.");
        return;
      }
      setMessage("Profile archived.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (sourceProfileId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/seller/shipping-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", sourceProfileId }),
      });
      if (!res.ok) {
        setError("Could not duplicate profile.");
        return;
      }
      setMessage("Profile duplicated.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller HQ · Shipping</p>
        <h1 className="font-display mt-1 text-2xl font-black text-white">Shipping Profiles</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Default profiles are copied for every seller. Edit weights and dimensions, set a default for new live shows,
          or archive profiles you no longer use.
        </p>
        <Link href="/account/seller" className="mt-3 inline-block text-sm text-gold-bright hover:underline">
          ← Back to Seller HQ
        </Link>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading profiles…</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="space-y-3">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">
                  {p.name}
                  {p.isDefault ? (
                    <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-bright">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.defaultWeightOz} oz · {p.defaultLengthIn}×{p.defaultWidthIn}×{p.defaultHeightIn} in · bundle{" "}
                  {p.bundleGroup}
                  {p.maxUnitsPerParcel ? ` · max ${p.maxUnitsPerParcel}/parcel` : ""}
                  {p.requiresSeparatePackage ? " · own parcel" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!p.isDefault ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setDefault(p.id)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200"
                  >
                    Set default
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void duplicate(p.id)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void archive(p.id)}
                  className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
