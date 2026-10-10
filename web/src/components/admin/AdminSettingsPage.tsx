"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type Setting = { key: string; label: string; help: string; enabled: boolean };

const LINKS = [
  { href: "/admin/fees", label: "Fee tiers", note: "Marketplace and live-show platform fee percentages." },
  { href: "/admin/app-banner", label: "App banner", note: "Announcement banner shown in the app." },
  { href: "/admin/shipping-profiles", label: "Shipping profiles", note: "Rates and rules per category." },
  { href: "/admin/team", label: "Team & permissions", note: "Who can do what in this console." },
];

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings", { cache: "no-store" });
    if (!res.ok) {
      setMsg("You do not have access to settings.");
      return;
    }
    setSettings(((await res.json()) as { settings: Setting[] }).settings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(s: Setting) {
    if (!window.confirm(`${s.enabled ? "Turn OFF" : "Turn ON"}: ${s.label}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: s.key, enabled: !s.enabled, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setReason("");
        setMsg("Saved. Takes effect within about 30 seconds.");
        await load();
      } else setMsg(data.error === "REASON_REQUIRED" ? "Add a reason (at least 5 characters)." : (data.error ?? "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCommandShell title="Settings" subtitle="Platform switches. Every change is logged with your reason.">
      <section className={`${adminPanelClassName} p-4 text-xs`}>
        <label htmlFor="settings-reason" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Reason for the next change
        </label>
        <input
          id="settings-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Grandfather list reviewed, turning on for new sellers"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
        />
        {msg ? <p className="mt-2 text-gold-bright">{msg}</p> : null}
        <ul className="mt-4 space-y-3">
          {settings.map((s) => (
            <li key={s.key} className="flex items-start justify-between gap-4 border-t border-white/[0.05] pt-3">
              <div>
                <p className="text-sm text-foreground">{s.label}</p>
                <p className="mt-1 max-w-xl text-zinc-500">{s.help}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                aria-label={s.label}
                disabled={busy}
                onClick={() => void toggle(s)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  s.enabled ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-zinc-400"
                }`}
              >
                {s.enabled ? "On" : "Off"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${adminPanelClassName} mt-4 p-4 text-xs`}>
        <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Other controls</h2>
        <ul className="mt-3 space-y-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-gold-bright hover:underline">
                {l.label}
              </Link>
              <span className="text-zinc-500"> — {l.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </AdminCommandShell>
  );
}
