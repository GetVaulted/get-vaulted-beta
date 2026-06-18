"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatShippingLiabilitySummary,
  LiveShowShippingSettingsFields,
  type LiveShowShippingSettingsValue,
  type PlatformShippingProfileOption,
} from "@/components/shipping/LiveShowShippingSettingsFields";

type LineupRow = {
  id: string;
  title: string;
  status: string;
  shippingProfileId: string | null;
  profileName: string | null;
  canEditProfile: boolean;
};

type Dashboard = {
  room: {
    defaultShippingProfileId: string | null;
    shippingCapEnabled: boolean;
    shippingCapCents: number | null;
    freeShippingEnabled: boolean;
    sellerPaysOverCap: boolean;
  };
  profiles: PlatformShippingProfileOption[];
  lineup: LineupRow[];
  liability: {
    collectedCents: number;
    estimatedLabelCostCents: number;
    sellerSubsidyCents: number;
    freeShippingEnabled: boolean;
    capWarning: boolean;
  };
  capWarningMessage: string | null;
};

type Props = {
  liveRoomId: string;
  compact?: boolean;
};

export function LiveShowShippingPanel({ liveRoomId, compact = false }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [settings, setSettings] = useState<LiveShowShippingSettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-shipping`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Could not load shipping settings.");
        return;
      }
      const data = (await res.json()) as Dashboard;
      setDashboard(data);
      setSettings({
        defaultShippingProfileId: data.room.defaultShippingProfileId ?? "",
        shippingCapEnabled: data.room.shippingCapEnabled,
        shippingCapCents: data.room.shippingCapCents,
        freeShippingEnabled: data.room.freeShippingEnabled,
        sellerPaysOverCap: data.room.sellerPaysOverCap,
      });
    } finally {
      setLoading(false);
    }
  }, [liveRoomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-shipping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultShippingProfileId: settings.defaultShippingProfileId || null,
          shippingCapEnabled: settings.shippingCapEnabled,
          shippingCapCents: settings.shippingCapCents,
          freeShippingEnabled: settings.freeShippingEnabled,
          sellerPaysOverCap: settings.sellerPaysOverCap,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; dashboard?: Dashboard };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Save failed.");
        return;
      }
      if (j.dashboard) setDashboard(j.dashboard);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  const patchItemProfile = async (itemId: string, itemShippingProfileId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-shipping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, itemShippingProfileId: itemShippingProfileId || null }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; dashboard?: Dashboard };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not update item profile.");
        return;
      }
      if (j.dashboard) setDashboard(j.dashboard);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading shipping…</p>;
  }

  if (!dashboard || !settings) {
    return error ? <p className="text-xs text-rose-300">{error}</p> : null;
  }

  const unsold = dashboard.lineup.filter((r) => r.status !== "sold" && r.status !== "skipped");

  return (
    <div className="space-y-3">
      {dashboard.liability ? (
        <div
          className={`rounded-lg border px-2.5 py-2 text-[11px] ${
            dashboard.liability.capWarning
              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
              : "border-white/10 bg-black/30 text-zinc-300"
          }`}
        >
          {formatShippingLiabilitySummary(dashboard.liability)}
          {dashboard.capWarningMessage ? (
            <p className="mt-1 font-semibold text-amber-200">{dashboard.capWarningMessage}</p>
          ) : null}
        </div>
      ) : null}

      <LiveShowShippingSettingsFields
        profiles={dashboard.profiles}
        value={settings}
        onChange={setSettings}
        compact={compact}
        disabled={busy}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => void saveSettings()}
        className="w-full rounded-lg border border-gold/35 bg-gold/10 py-2 text-[11px] font-black uppercase tracking-wide text-gold-bright disabled:opacity-40"
      >
        {busy ? "Saving…" : saved ? "Saved" : "Save show shipping"}
      </button>

      {unsold.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Queue profiles</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {unsold.slice(0, 12).map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-200">{row.title}</p>
                <select
                  disabled={busy || !row.canEditProfile}
                  value={row.shippingProfileId ?? ""}
                  onChange={(e) => void patchItemProfile(row.id, e.target.value)}
                  className="max-w-[9rem] rounded border border-white/10 bg-zinc-950 px-1.5 py-1 text-[10px] text-white"
                  title={row.canEditProfile ? row.profileName ?? undefined : "Locked after label"}
                >
                  <option value="">Default</option>
                  {dashboard.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
