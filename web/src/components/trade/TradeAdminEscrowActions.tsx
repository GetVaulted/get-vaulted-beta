"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS = [
  { id: "release", label: "Release cash → complete" },
  { id: "refund", label: "Refund cash → cancel" },
  { id: "resolve_complete", label: "Mark completed (no money move)" },
  { id: "reinstate", label: "Reinstate to accepted" },
] as const;

/** Admin-only escrow controls on the trade detail page. */
export function TradeAdminEscrowActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const run = async (action: (typeof ACTIONS)[number]["id"]) => {
    setBusy(action);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/admin/trade/offers/${encodeURIComponent(offerId)}/cash-escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        pendingConnect?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Admin action failed.");
        return;
      }
      setOkMsg(body.pendingConnect ? "Completed — cash still held (payee needs Connect)." : "Done.");
      router.refresh();
    } catch {
      setError("Admin action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-950/15 p-4">
      <p className="text-sm font-semibold text-amber-100">Admin · trade cash escrow</p>
      <p className="mt-1 text-xs text-zinc-500">
        Cash is platform-held until release. Use these after reviewing a dispute.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(a.id)}
            className="inline-flex h-9 items-center rounded-full border border-amber-300/30 bg-black/20 px-3 text-xs font-semibold text-amber-50 disabled:opacity-50"
          >
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
      </div>
      {okMsg ? <p className="mt-2 text-xs font-medium text-emerald-200">{okMsg}</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}
    </section>
  );
}
