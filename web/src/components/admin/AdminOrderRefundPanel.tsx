"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminStatusPill, adminButtonPrimaryClassName, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { refundRequestStatusLabel } from "@/lib/order-refund-eligibility";

type Req = { id: string; kind: string; status: string; reason: string; createdAt: string; refundedAt: string | null };

/** On an order: see its refund requests, or open one on the buyer's behalf (no money moves until you accept it in the queue). */
export function AdminOrderRefundPanel({ orderId, paymentStatus }: { orderId: string; paymentStatus: string }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [kind, setKind] = useState<"cancel" | "return">("cancel");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund-request`, { cache: "no-store" });
    if (res.ok) setRows(((await res.json()) as { requests: Req[] }).requests);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasOpen = rows.some((r) => !["refunded", "support_denied"].includes(r.status));

  async function open() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: "Request opened. Accept or deny it in Refunds." });
        setReason("");
        await load();
      } else {
        setMsg({
          ok: false,
          text:
            j.error === "REQUEST_ALREADY_OPEN"
              ? "There is already an open request on this order."
              : j.error === "ORDER_NOT_PAID"
                ? "This order isn't paid, so there is nothing to refund."
                : j.error === "ALREADY_REFUNDED"
                  ? "This order is already refunded."
                  : `Failed: ${j.error ?? res.status}`,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${adminPanelClassName} mt-6 p-4 text-xs`}>
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Refunds &amp; cancels</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-zinc-600">No requests on this order.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] pb-2">
              <AdminStatusPill tone={r.status === "refunded" ? "ok" : r.status === "escalated" ? "bad" : "warn"}>
                {refundRequestStatusLabel(r.status)}
              </AdminStatusPill>
              <span className="text-zinc-400">
                {r.kind} · {new Date(r.createdAt).toLocaleDateString()}
              </span>
              <Link href={`/admin/refund-requests?focus=${r.id}`} className="text-gold-bright hover:underline">
                open in queue
              </Link>
              <span className="w-full text-zinc-500">{r.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {paymentStatus === "paid" && !hasOpen ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="text-zinc-400">Open a request for the buyer. It goes to the Refunds queue; no money moves until you accept it there.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="admin-refund-kind" className="sr-only">
              Request type
            </label>
            <select
              id="admin-refund-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "cancel" | "return")}
              className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            >
              <option value="cancel">Cancel / refund</option>
              <option value="return">Return / refund</option>
            </select>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason"
            placeholder="Reason (required, saved to the activity log)"
            rows={2}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          />
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={() => void open()}
            className={`mt-2 ${adminButtonPrimaryClassName}`}
          >
            {busy ? "Opening…" : "Open request"}
          </button>
        </div>
      ) : null}
      {msg ? <p className={`mt-2 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
    </section>
  );
}
