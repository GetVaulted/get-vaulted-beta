"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ReportDetail = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  status: string;
  moderationNotes: string;
  liveRoomId: string | null;
  createdAt: string;
  reporter: { username: string } | null;
};

type AuditRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  actor: { username: string };
};

export function AdminReportDetailPage() {
  const params = useParams();
  const reportId = typeof params?.id === "string" ? params.id : "";
  const { data: session } = useSession();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [reporterEmail, setReporterEmail] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceJson, setEvidenceJson] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!reportId) return;
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`, { cache: "no-store" });
    if (!res.ok) {
      setReport(null);
      return;
    }
    const j = (await res.json()) as {
      report?: ReportDetail;
      reporterEmail?: string;
      auditLogs?: AuditRow[];
    };
    setReport(j.report ?? null);
    setReporterEmail(j.reporterEmail ?? "");
    setAuditLogs(Array.isArray(j.auditLogs) ? j.auditLogs : []);
    setNotes(j.report?.moderationNotes ?? "");
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (action: string, extra?: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const generateEvidence = async () => {
    if (!report) return;
    setBusy(true);
    setError(null);
    try {
      let url = "";
      if (report.targetType === "order") {
        url = `/api/admin/orders/${encodeURIComponent(report.targetId)}/evidence`;
      } else {
        setError("Evidence bundle is available for order reports from this page. Use order admin for others.");
        return;
      }
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { error?: string; summary?: unknown };
      if (!res.ok) {
        setError(data.error ?? "Evidence failed.");
        return;
      }
      setEvidenceJson(JSON.stringify(data.summary, null, 2));
    } finally {
      setBusy(false);
    }
  };

  if (!report) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-zinc-500">
        {reportId ? "Loading or not found." : "Invalid report."}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-4 lg:px-10">
      <Link href="/admin/reports" className="text-xs font-semibold text-gold-bright/90 hover:text-gold-bright">
        ← Moderation queue
      </Link>
      <h1 className="font-display mt-4 text-xl font-black">Report {report.id.slice(0, 10)}…</h1>
      <p className="mt-1 text-xs capitalize text-zinc-500">
        {report.status} · {report.targetType} · {report.reason.replace(/_/g, " ")}
      </p>

      <div className="mt-6 space-y-3 rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-5 text-sm">
        <p>
          <span className="text-zinc-500">Target</span>{" "}
          <span className="font-mono text-zinc-200">{report.targetId}</span>
        </p>
        <p>
          <span className="text-zinc-500">Reporter</span> @{report.reporter?.username} ({reporterEmail})
        </p>
        {report.description ? <p className="text-zinc-300">{report.description}</p> : null}
        {report.liveRoomId ? (
          <p>
            <span className="text-zinc-500">Live room</span>{" "}
            <Link href={`/live/${encodeURIComponent(report.liveRoomId)}`} className="text-gold-bright hover:underline">
              {report.liveRoomId}
            </Link>
          </p>
        ) : null}
      </div>

      <label className="mt-6 block text-[10px] font-bold uppercase text-zinc-500">
        Moderation notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#08080a] px-3 py-2 text-sm text-zinc-200"
        />
      </label>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch("note", { moderationNotes: notes })}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-zinc-200"
        >
          Save notes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void patch("assign", { assignedAdminId: session?.user?.id ?? "" })
          }
          className="rounded-full border border-gold/30 px-4 py-2 text-xs font-bold text-gold-bright"
        >
          Assign to me
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch("resolve")}
          className="rounded-full bg-emerald-700/80 px-4 py-2 text-xs font-bold text-white"
        >
          Resolve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch("dismiss")}
          className="rounded-full bg-zinc-700 px-4 py-2 text-xs font-bold text-white"
        >
          Dismiss
        </button>
        {report.targetType === "order" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void generateEvidence()}
            className="rounded-full border border-amber-500/40 px-4 py-2 text-xs font-bold text-amber-200"
          >
            Generate dispute evidence
          </button>
        ) : null}
      </div>

      {evidenceJson ? (
        <pre className="mt-6 max-h-96 overflow-auto rounded-xl border border-white/[0.08] bg-[#08080a] p-4 text-[10px] text-zinc-400">
          {evidenceJson}
        </pre>
      ) : null}

      <h2 className="mt-8 text-[10px] font-black uppercase tracking-wide text-zinc-500">Audit log</h2>
      <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
        {auditLogs.map((l) => (
          <li key={l.id} className="px-4 py-3 text-xs">
            <span className="font-mono text-zinc-600">{new Date(l.createdAt).toLocaleString()}</span>
            <span className="mx-2 text-zinc-500">·</span>
            <span className="font-semibold text-zinc-300">{l.action}</span>
            <span className="text-zinc-500"> by @{l.actor.username}</span>
            {l.detail ? <p className="mt-1 text-zinc-500">{l.detail}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
