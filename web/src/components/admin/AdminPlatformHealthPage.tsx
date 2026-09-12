"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCommandShell, AdminStatusPill, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import type {
  AdminHealthCheck,
  AdminHealthPayload,
  AdminHealthStatus,
} from "@/lib/admin/admin-platform-health";

const POLL_MS = 15_000;

function toneFor(status: AdminHealthStatus): "ok" | "warn" | "bad" | "neutral" {
  if (status === "ok") return "ok";
  if (status === "error") return "bad";
  if (status === "degraded") return "warn";
  return "neutral";
}

function formatAge(updatedAt: string, nowMs: number): string {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return new Date(updatedAt).toLocaleString();
}

function HealthCheckCard({ check }: { check: AdminHealthCheck }) {
  const bad = check.status !== "ok";
  return (
    <li className={`${adminPanelClassName} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-100">{check.label}</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">{check.detail}</p>
          {bad && check.issue ? (
            <div className="mt-3 space-y-2 rounded-lg border border-white/[0.06] bg-black/30 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400/90">Issue</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">{check.issue}</p>
              </div>
              {check.solution ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/80">Fix</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{check.solution}</p>
                </div>
              ) : null}
              {check.log ? (
                <p className="break-all font-mono text-[10px] leading-relaxed text-zinc-600">{check.log}</p>
              ) : null}
            </div>
          ) : null}
          {check.href ? (
            <Link
              href={check.href}
              className="mt-3 inline-flex text-[11px] font-semibold text-gold-bright hover:underline"
            >
              Open related admin →
            </Link>
          ) : null}
        </div>
        <AdminStatusPill tone={toneFor(check.status)}>{check.status}</AdminStatusPill>
      </div>
    </li>
  );
}

export function AdminPlatformHealthPage() {
  const [data, setData] = useState<AdminHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const initialDone = useRef(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true && initialDone.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (!res.ok) {
        setError(`Health check failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as AdminHealthPayload;
      setData(json);
      setError(null);
      setNowMs(Date.now());
      initialDone.current = true;
    } catch {
      setError("Health check failed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void load({ quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <AdminCommandShell
      title="Platform Health"
      subtitle="Live infrastructure diagnostics — each unhealthy check includes what’s wrong and how to fix it."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">
            {refreshing ? "Refreshing…" : data ? `Live · updated ${formatAge(data.updatedAt, nowMs)}` : null}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            Refresh
          </button>
        </div>
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
              <AdminStatusPill tone={toneFor(data.overall)}>{data.overall}</AdminStatusPill>
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              Auto-refreshes every 15s · {new Date(data.updatedAt).toLocaleString()}
            </p>
          </div>

          <ul className="mt-6 grid gap-3 lg:grid-cols-2">
            {data.checks.map((c) => (
              <HealthCheckCard key={c.id} check={c} />
            ))}
          </ul>

          <section className={`${adminPanelClassName} mt-8 p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-black text-foreground">Recent issues</h2>
              <p className="text-[11px] text-zinc-600">Diagnostic log from the latest probe</p>
            </div>
            {data.recentIssues?.length ? (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {data.recentIssues.map((row) => (
                  <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminStatusPill tone={toneFor(row.status)}>{row.status}</AdminStatusPill>
                      <span className="text-xs font-semibold text-zinc-200">{row.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-300">{row.issue}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-400">Fix: </span>
                      {row.solution}
                    </p>
                    {row.log ? (
                      <p className="mt-1 break-all font-mono text-[10px] text-zinc-600">{row.log}</p>
                    ) : null}
                    {row.href ? (
                      <Link href={row.href} className="mt-2 inline-flex text-[11px] font-semibold text-gold-bright hover:underline">
                        Open related admin →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">No active issues — all checks that report status are healthy.</p>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-rose-400">{error ?? "Health check failed."}</p>
      )}
    </AdminCommandShell>
  );
}
