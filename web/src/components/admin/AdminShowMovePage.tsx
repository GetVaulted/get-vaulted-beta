"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCommandShell,
  AdminStatusPill,
  adminButtonPrimaryClassName,
  adminPanelClassName,
} from "@/components/admin/AdminCommandShell";
import type { MovePlan } from "@/lib/admin/admin-show-move";

type ShowOption = { id: string; title: string; status: string; seller: string; items: number; when: string | null };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const cents = (n: number) => usd(n / 100);

function ShowPicker({
  label,
  value,
  onPick,
}: {
  label: string;
  value: ShowOption | null;
  onPick: (s: ShowOption | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ShowOption[]>([]);

  useEffect(() => {
    if (value) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/live-shows/move/shows?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const j = (await res.json()) as { shows?: ShowOption[] };
        setResults(j.shows ?? []);
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, value]);

  return (
    <div className={`${adminPanelClassName} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      {value ? (
        <div className="mt-2 flex items-start justify-between gap-3 text-xs">
          <div>
            <p className="font-semibold text-zinc-100">{value.title}</p>
            <p className="text-zinc-500">
              @{value.seller} · {value.status} · {value.items} lots
              {value.when ? ` · ${new Date(value.when).toLocaleDateString()}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => onPick(null)} className="text-zinc-500 hover:text-zinc-200">
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Search ${label}`}
            placeholder="Search by @seller or show title"
            className="mt-2 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]"
                >
                  <span className="block truncate font-semibold text-zinc-200">{s.title}</span>
                  <span className="block text-zinc-500">
                    @{s.seller} · {s.status} · {s.items} lots
                    {s.when ? ` · ${new Date(s.when).toLocaleDateString()}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 ? <li className="px-2 py-1 text-zinc-600">No shows found.</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}

export function AdminShowMovePage() {
  const [from, setFrom] = useState<ShowOption | null>(null);
  const [to, setTo] = useState<ShowOption | null>(null);
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = all items
  const [link, setLink] = useState(true);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const itemsParam = useMemo(() => (selected ? [...selected].join(",") : ""), [selected]);

  const loadPlan = useCallback(async () => {
    if (!from || !to) {
      setPlan(null);
      return;
    }
    setPlanError(null);
    const sp = new URLSearchParams({ from: from.id, to: to.id, link: link ? "1" : "0" });
    if (itemsParam) sp.set("items", itemsParam);
    const res = await fetch(`/api/admin/live-shows/move/preview?${sp.toString()}`, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { plan?: MovePlan; error?: string };
    if (res.ok && j.plan) setPlan(j.plan);
    else {
      setPlan(null);
      setPlanError(j.error ?? "Could not build the preview.");
    }
  }, [from, to, link, itemsParam]);

  useEffect(() => {
    setConfirming(false);
    setResult(null);
    void loadPlan();
  }, [loadPlan]);

  // Reset item selection whenever the old show changes.
  useEffect(() => {
    setSelected(null);
  }, [from?.id]);

  function toggle(id: string) {
    if (!plan) return;
    const base = selected ?? new Set(plan.items.map((i) => i.id));
    const next = new Set(base);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next.size === plan.items.length ? null : next);
  }

  const canRun = !!plan && plan.blockers.length === 0 && reason.trim().length >= 5;

  async function run() {
    if (!plan) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/live-shows/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromRoomId: plan.from.id,
          toRoomId: plan.to.id,
          itemIds: selected ? [...selected] : null,
          linkContinuation: link,
          reason: reason.trim(),
          expect: {
            items: plan.totals.items,
            paidSpots: plan.totals.paidSpots,
            pendingSpots: plan.totals.pendingSpots,
            buyers: plan.totals.buyers,
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        moved?: { items: number; purchases: number };
        linkedContinuation?: boolean;
      };
      if (res.ok && j.ok) {
        setResult({
          ok: true,
          text: `Moved ${j.moved?.items ?? 0} lots and ${j.moved?.purchases ?? 0} sold spots.${j.linkedContinuation ? " Shipping is linked." : ""}`,
        });
        setReason("");
        setConfirming(false);
        await loadPlan();
      } else {
        setResult({
          ok: false,
          text:
            j.error === "PLAN_CHANGED"
              ? "Something changed since the preview (a sale or edit). Review the refreshed preview and try again."
              : `Failed: ${j.error ?? res.status}`,
        });
        setConfirming(false);
        await loadPlan();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCommandShell
      title="Move items between shows"
      subtitle="Move a seller's lots and sold spots from an old show into a new one and carry shipping forward. You see exactly what changes before anything is touched."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <ShowPicker label="From (old show)" value={from} onPick={setFrom} />
        <ShowPicker label="To (new show)" value={to} onPick={setTo} />
      </div>

      {planError ? <p className="mt-4 text-xs text-rose-300">{planError}</p> : null}

      {plan ? (
        <div className="mt-6 space-y-4 text-xs">
          {plan.blockers.length > 0 ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-950/30 p-4 text-rose-100">
              <p className="font-bold">Can&apos;t move yet</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-4 text-amber-100">
              <p className="font-bold">Read before you confirm</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`${adminPanelClassName} p-4`}>
              <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Lots ({plan.totals.items} moving of {plan.items.length})
              </h2>
              <ul className="mt-3 space-y-1.5">
                {plan.items.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 border-b border-white/[0.05] pb-1.5">
                    <input
                      id={`mv-${i.id}`}
                      type="checkbox"
                      checked={i.moving}
                      onChange={() => toggle(i.id)}
                      className="mt-0.5"
                    />
                    <label htmlFor={`mv-${i.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block truncate text-zinc-200">{i.title}</span>
                      <span className="text-zinc-500">
                        {i.status} · {i.paidSpots} paid spots
                        {i.pendingSpots ? ` · ${i.pendingSpots} unpaid` : ""}
                        {i.bids ? ` · ${i.bids} bids` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${adminPanelClassName} p-4`}>
              <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Buyers affected ({plan.totals.buyers})
              </h2>
              <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
                {plan.buyers.map((b) => (
                  <li key={b.buyerId} className="border-b border-white/[0.05] pb-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-zinc-200">@{b.username}</span>
                      <span className="text-zinc-500">
                        {b.spots} spots · {usd(b.paidUsd)}
                      </span>
                    </div>
                    <p className="text-zinc-500">
                      {b.shippingInOldShow
                        ? `Shipping in old show: ${b.shippingInOldShow.orders} orders, ${cents(b.shippingInOldShow.chargedCents)} charged${b.shippingInOldShow.capReached ? " (cap reached)" : ""}`
                        : "No shipping charged yet"}
                      {b.hasSessionInNewShow ? " · already has a shipping session in the new show" : ""}
                    </p>
                  </li>
                ))}
                {plan.buyers.length === 0 ? <li className="text-zinc-600">No buyers on these lots.</li> : null}
              </ul>
            </div>
          </div>

          <div className={`${adminPanelClassName} p-4`}>
            <label className="flex items-center gap-2 text-zinc-300">
              <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
              Link the new show to the old one so buyers&apos; shipping carries forward
              {plan.willLinkContinuation ? <AdminStatusPill tone="ok">will link</AdminStatusPill> : null}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Reason"
              placeholder="Reason (required, saved to the activity log)"
              rows={2}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
            />
            {confirming ? (
              <div className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] p-3 text-zinc-200">
                <p>
                  Move {plan.totals.items} lots, {plan.totals.paidSpots} paid spots and {plan.totals.buyers} buyers from{" "}
                  <b>{plan.from.title}</b> to <b>{plan.to.title}</b>. This changes live data.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy || !canRun} onClick={() => void run()} className={adminButtonPrimaryClassName}>
                    {busy ? "Moving…" : "Yes, move them"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-3 text-zinc-400 hover:text-zinc-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canRun}
                onClick={() => setConfirming(true)}
                className={`mt-3 ${adminButtonPrimaryClassName}`}
              >
                Review &amp; move
              </button>
            )}
            {!canRun && plan.blockers.length === 0 ? (
              <p className="mt-2 text-zinc-500">Write a reason (at least 5 characters) to continue.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {result ? (
        <p className={`mt-4 text-xs ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.text}</p>
      ) : null}
    </AdminCommandShell>
  );
}
