"use client";

import { useCallback, useEffect, useState } from "react";
import { adminPanelClassName } from "@/components/admin/AdminCommandShell";

type Credit = {
  id: string;
  username: string | null;
  amountUsd: number;
  remainingUsd: number;
  note: string | null;
  stripeTransferId: string | null;
  createdAt: string;
};

const fieldClass = "rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200";

/**
 * Record money you already put into a seller's Stripe balance, so the seller's "Initiate Payout" button can
 * send it to their bank. Recording a credit does not move money.
 */
export function AdminManualPayoutCreditCard() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [transferId, setTransferId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/payouts/manual-credit", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { credits?: Credit[] } | null;
    setCredits(j?.credits ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/payouts/manual-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          amountUsd: Number(amount),
          stripeTransferId: transferId.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; username?: string; amountUsd?: number };
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error ?? "Could not save the credit." });
        return;
      }
      setMsg({ kind: "ok", text: `Credited $${(j.amountUsd ?? 0).toFixed(2)} to @${j.username}. They can now pay it out.` });
      setAmount("");
      setTransferId("");
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${adminPanelClassName} mb-6 p-4`}>
      <h2 className="text-sm font-bold text-foreground">Add payout credit</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Use this after you add money to a seller&apos;s Stripe balance by hand. It lets them send that money to their
        bank with Initiate Payout (no $100 minimum). This does not move money.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Seller username</span>
          <input id="manual-credit-username" value={username} onChange={(e) => setUsername(e.target.value)} className={fieldClass} placeholder="dyljack_breaks" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Amount (USD)</span>
          <input id="manual-credit-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={fieldClass} placeholder="2889.00" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Stripe transfer id (optional, checked)</span>
          <input id="manual-credit-transfer" value={transferId} onChange={(e) => setTransferId(e.target.value)} className={fieldClass} placeholder="tr_..." />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Note (optional)</span>
          <input id="manual-credit-note" value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="PayPal orders covered" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || username.trim().length < 3 || !(Number(amount) > 0)}
          onClick={() => void submit()}
          className="rounded-lg bg-emerald-500/90 px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
        >
          {busy ? "Saving…" : "Add credit"}
        </button>
        {msg ? (
          <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>
        ) : null}
      </div>
      {credits.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Seller</th>
                <th className="py-2 pr-3">Credited</th>
                <th className="py-2 pr-3">Unspent</th>
                <th className="py-2 pr-3">Added</th>
                <th className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-3">@{c.username ?? "?"}</td>
                  <td className="py-2 pr-3 tabular-nums">${c.amountUsd.toFixed(2)}</td>
                  <td className="py-2 pr-3 tabular-nums">${c.remainingUsd.toFixed(2)}</td>
                  <td className="py-2 pr-3">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">{c.note ?? c.stripeTransferId ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
