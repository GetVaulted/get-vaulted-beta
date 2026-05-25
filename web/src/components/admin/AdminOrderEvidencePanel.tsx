"use client";

import { useState } from "react";

export function AdminOrderEvidencePanel({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/evidence`, { method: "POST" });
      const data = (await res.json()) as { error?: string; summary?: unknown; bundleId?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setJson(JSON.stringify({ bundleId: data.bundleId, ...((data.summary as object) ?? {}) }, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispute-evidence-${orderId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/85">Dispute evidence</p>
      <p className="mt-2 text-xs text-zinc-400">
        Generates a JSON package with order details, bids, tracking, payout state, chat logs, and replay links.
      </p>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-full border border-amber-500/40 px-4 py-2 text-xs font-bold text-amber-100 disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate dispute evidence"}
        </button>
        {json ? (
          <button
            type="button"
            onClick={download}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-zinc-200"
          >
            Download JSON
          </button>
        ) : null}
      </div>
      {json ? (
        <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-[#08080a] p-3 text-[10px] text-zinc-500">
          {json}
        </pre>
      ) : null}
    </section>
  );
}
