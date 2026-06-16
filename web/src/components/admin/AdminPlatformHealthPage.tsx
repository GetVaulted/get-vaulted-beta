"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCommandShell, AdminStatusPill, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type HealthCheck = {
  id: string;
  label: string;
  status: "ok" | "degraded" | "unknown" | "error";
  detail: string;
  probeEndpoint?: string;
};

type Payload = {
  overall: string;
  checks: HealthCheck[];
  updatedAt: string;
};

function toneFor(status: HealthCheck["status"]): "ok" | "warn" | "bad" | "neutral" {
  if (status === "ok") return "ok";
  if (status === "error") return "bad";
  if (status === "degraded") return "warn";
  return "neutral";
}

export function AdminPlatformHealthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCommandShell
      title="Platform Health"
      subtitle="Infrastructure status probes. Several checks are configuration-only until dedicated health endpoints ship."
      actions={
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
          Refresh
        </button>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-zinc-500">Running health checks…</p>
      ) : data ? (
        <>
          <div className={`${adminPanelClassName} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-zinc-500">Overall</p>
                <p className="mt-1 font-display text-xl font-black capitalize text-foreground">{data.overall}</p>
              </div>
              <AdminStatusPill tone={toneFor(data.overall === "ok" ? "ok" : data.overall === "error" ? "error" : "degraded")}>
                {data.overall}
              </AdminStatusPill>
            </div>
            <p className="mt-2 text-xs text-zinc-600">Updated {new Date(data.updatedAt).toLocaleString()}</p>
          </div>

          <ul className="mt-6 grid gap-3 lg:grid-cols-2">
            {data.checks.map((c) => (
              <li key={c.id} className={`${adminPanelClassName} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-100">{c.label}</p>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">{c.detail}</p>
                    {c.probeEndpoint?.startsWith("TODO") ? (
                      <p className="mt-2 font-mono text-[10px] text-zinc-600">{c.probeEndpoint}</p>
                    ) : null}
                  </div>
                  <AdminStatusPill tone={toneFor(c.status)}>{c.status}</AdminStatusPill>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-rose-400">Health check failed.</p>
      )}
    </AdminCommandShell>
  );
}
