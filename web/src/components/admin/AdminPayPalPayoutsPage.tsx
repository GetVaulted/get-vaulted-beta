"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AdminCommandShell, adminPanelClassName, formatAdminUsd } from "@/components/admin/AdminCommandShell";

type OrderRow = {
  orderId: string;
  itemTitle: string;
  estimatedNetUsd: number;
  processingFeeUsd?: number;
  createdAt: string;
  shippedAt: string | null;
  deliveryConfirmedAt: string | null;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutReleasedAt: string | null;
  paypalPayoutStatus: string | null;
  paypalPayoutFeeCents: number | null;
  processorTransferId: string | null;
  needsAttention: boolean;
};

type SellerRow = {
  sellerId: string;
  username: string | null;
  email: string | null;
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: string | null;
  orderCount: number;
  owedUsd: number;
  outstandingLiabilityUsd: number;
  netOfLiabilityUsd: number;
  needsAttentionCount: number;
  blockedReason: string | null;
  paidOutOrderCount: number;
  partialPaidUsd: number;
  remainingUsd: number;
  partialPayments: { id: string; amountUsd: number; note: string | null; createdAt: string }[];
  orders: OrderRow[];
};

type Payload = {
  sellers: SellerRow[];
  sellerCount: number;
  orderCount: number;
  totalOwedUsd: number;
  totalRemainingUsd: number;
  needsAttentionCount: number;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatAdminUsd(n) ?? `$${n.toFixed(2)}`;
}

/** Where a PayPal-routed order actually stands — this is the thing that wasn't visible before. */
function payoutStageLabel(o: OrderRow): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  if (o.payoutStatus === "paid_out" || o.processorTransferId?.trim()) {
    const status = (o.paypalPayoutStatus ?? "").toLowerCase();
    if (status === "failed" || status === "returned") {
      return { label: `Sent, then ${status}`, tone: "bad" };
    }
    return { label: "Sent to PayPal", tone: "ok" };
  }
  if (o.payoutStatus === "blocked") return { label: "Blocked", tone: "bad" };
  if (o.payoutStatus === "manual_review") return { label: "Manual review", tone: "bad" };
  if (
    o.payoutStatus === "fast_payout_ready" ||
    o.payoutStatus === "label_payout_ready" ||
    o.payoutStatus === "instant_payout_ready"
  ) {
    return { label: "Ready to release", tone: "warn" };
  }
  if (o.payoutStatus === "delivery_confirmed") return { label: "Delivered · awaiting hold", tone: "neutral" };
  if (o.payoutStatus === "held") return { label: "Held", tone: "neutral" };
  return { label: "Pending", tone: "neutral" };
}

function toneClasses(tone: "ok" | "warn" | "bad" | "neutral") {
  switch (tone) {
    case "ok":
      return "text-emerald-200";
    case "warn":
      return "text-amber-200";
    case "bad":
      return "text-rose-300";
    default:
      return "text-zinc-400";
  }
}

export function AdminPayPalPayoutsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reason, setReason] = useState("Admin PayPal payout release");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [healing, setHealing] = useState(false);
  const [markingPaidSellerId, setMarkingPaidSellerId] = useState<string | null>(null);
  const [partialFor, setPartialFor] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialNote, setPartialNote] = useState("");
  const [partialBusy, setPartialBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/paypal", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load PayPal payout queue.");
        return;
      }
      setData((await res.json()) as Payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseOrder = async (o: OrderRow) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusyOrderId(o.orderId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(o.orderId)}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_payout", reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Release failed.");
        return;
      }
      setNote(`Released PayPal payout for order ${o.orderId.slice(0, 10)}…`);
      await load();
    } finally {
      setBusyOrderId(null);
    }
  };

  /**
   * Orders that already look shipped (per their own DB fields) but whose payoutStatus never
   * advanced off "held" — a stuck evaluation, not a legitimate hold. Shared with the Bank
   * Payouts page; see heal-stuck-payout-evaluations.ts for why this class of order exists.
   */
  const healStuck = async () => {
    setHealing(true);
    setError(null);
    setNote(null);
    try {
      // A single call only works a short, time-budgeted batch (see heal-stuck-payout-evaluations.ts)
      // so it can never be killed mid-flight by the platform's function timeout — loop here,
      // accumulating totals, until the server says there's nothing left (hasMore: false).
      let totalCandidates = 0;
      let totalHealed = 0;
      let totalHealedUsd = 0;
      let totalStillStuck = 0;
      let totalErrored = 0;
      let hasMore = true;
      let round = 0;
      while (hasMore && round < 40) {
        round += 1;
        const res = await fetch("/api/admin/payouts/heal-stuck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          candidates?: number;
          healed?: number;
          healedUsd?: number;
          stillStuck?: number;
          errored?: number;
          hasMore?: boolean;
        };
        if (!res.ok) {
          setError(typeof j.error === "string" ? j.error : "Recheck failed.");
          return;
        }
        totalCandidates += j.candidates ?? 0;
        totalHealed += j.healed ?? 0;
        totalHealedUsd += j.healedUsd ?? 0;
        totalStillStuck += j.stillStuck ?? 0;
        totalErrored += j.errored ?? 0;
        hasMore = j.hasMore === true;
        if ((j.candidates ?? 0) === 0) break;
        if (hasMore) {
          setNote(
            `Unstuck ${totalHealed} order${totalHealed === 1 ? "" : "s"} so far (${money(totalHealedUsd)}) — still working…`,
          );
        }
      }
      setNote(
        totalHealed > 0
          ? `Unstuck ${totalHealed} order${totalHealed === 1 ? "" : "s"} (${money(totalHealedUsd)}) that were already shipped` +
              ` but never advanced off held` +
              (totalStillStuck > 0 ? ` · ${totalStillStuck} still genuinely waiting` : "") +
              (totalErrored > 0 ? ` · ${totalErrored} errored (logged for follow-up)` : "")
          : `Checked ${totalCandidates} held order${totalCandidates === 1 ? "" : "s"} — none were ready yet.`,
      );
      await load();
    } finally {
      setHealing(false);
    }
  };

  /**
   * Record that a seller's PayPal-rail balance was already paid off-platform (e.g. sent directly
   * via PayPal or Stripe by hand) — never calls the PayPal API. Also runs the same outstanding
   * shipping-label-liability recovery a real release would, so that offset isn't silently lost.
   */
  const markSellerPaid = async (s: SellerRow) => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    const handle = s.username?.trim() || s.sellerId.slice(0, 8);
    const amountLabel = money(s.remainingUsd);
    const confirmed = window.confirm(
      `Mark @${handle}'s ${s.orderCount} PayPal order${s.orderCount === 1 ? "" : "s"} as already paid?\n\n` +
        (s.partialPaidUsd > 0
          ? `You already recorded ${money(s.partialPaidUsd)} in partial payments, so the remaining amount is ${amountLabel}.\n\n`
          : "") +
        `This records that you already sent them ${amountLabel} yourself \u2014 it does NOT call PayPal or move any money. ` +
        `Only confirm if that money has already left your account.`,
    );
    if (!confirmed) return;

    setMarkingPaidSellerId(s.sellerId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/payouts/paypal/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: s.sellerId, reason: reason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        marked?: number;
        sentUsd?: number;
        liabilityRecoveredUsd?: number;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Mark paid failed.");
        return;
      }
      const marked = j.marked ?? 0;
      setNote(
        marked > 0
          ? `Marked ${marked} order${marked === 1 ? "" : "s"} paid for @${handle} (${money(j.sentUsd ?? 0)})` +
              ((j.liabilityRecoveredUsd ?? 0) > 0
                ? ` \u00b7 recovered ${money(j.liabilityRecoveredUsd)} in outstanding label costs`
                : "")
          : `No orders needed marking for @${handle}.`,
      );
      await load();
    } finally {
      setMarkingPaidSellerId(null);
    }
  };

  const openPartial = (s: SellerRow) => {
    setPartialFor((cur) => (cur === s.sellerId ? null : s.sellerId));
    setPartialAmount("");
    setPartialNote("");
    setError(null);
  };

  /** Record a partial payment you already sent (never calls PayPal) — the page then shows the remainder. */
  const recordPartial = async (s: SellerRow) => {
    const amount = Number(partialAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the amount you already sent, greater than $0.");
      return;
    }
    const handle = s.username?.trim() || s.sellerId.slice(0, 8);
    const left = Math.max(0, Math.round((s.remainingUsd - amount) * 100) / 100);
    const confirmed = window.confirm(
      `Record ${money(amount)} as already sent to @${handle}?\n\n` +
        `Remaining after this: ${money(left)}.\n\n` +
        `This only records it \u2014 it does NOT call PayPal or move any money.`,
    );
    if (!confirmed) return;
    setPartialBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/payouts/paypal/partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: s.sellerId, amountUsd: amount, note: partialNote.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; remainingUsd?: number };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not record the partial payment.");
        return;
      }
      setNote(`Recorded ${money(amount)} sent to @${handle} \u00b7 ${money(j.remainingUsd ?? left)} still to send.`);
      setPartialFor(null);
      setPartialAmount("");
      setPartialNote("");
      await load();
    } finally {
      setPartialBusy(false);
    }
  };

  const undoPartial = async (s: SellerRow, id: string, amountUsd: number) => {
    if (!window.confirm(`Undo the ${money(amountUsd)} partial payment entry for @${s.username ?? s.sellerId.slice(0, 8)}?`)) {
      return;
    }
    setError(null);
    setNote(null);
    const res = await fetch("/api/admin/payouts/paypal/partial", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not undo that entry.");
      return;
    }
    setNote(`Removed the ${money(amountUsd)} entry.`);
    await load();
  };

  const totalOwed = data?.totalOwedUsd ?? 0;
  const totalRemaining = data?.totalRemainingUsd ?? 0;
  const needsAttention = data?.needsAttentionCount ?? 0;

  return (
    <AdminCommandShell
      title="PayPal payouts"
      subtitle="Every paid order routed to the PayPal seller-payout rail, and exactly where each one stands."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payouts"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            Bank payouts (Stripe)
          </Link>
          <button
            type="button"
            onClick={() => void healStuck()}
            disabled={healing}
            title="Re-check paid + shipped orders stuck at held that never advanced to ready"
            className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 disabled:opacity-50 hover:bg-amber-500/15"
          >
            {healing ? "Rechecking…" : "Recheck stuck orders"}
          </button>
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
        <p className="text-sm text-zinc-500">Loading PayPal payout queue…</p>
      ) : (
        <>
          <div className={`${adminPanelClassName} mb-6 flex flex-wrap items-end justify-between gap-3 p-4`}>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Sellers</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">
                  {data?.sellerCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Unpaid orders</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">
                  {data?.orderCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Owed (not yet paid, after processing fees)</p>
                <p className="mt-1 font-display text-3xl font-black text-foreground">{money(totalOwed)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Left to send (after label costs + partials)</p>
                <p className="mt-1 font-display text-3xl font-black text-gold-bright">{money(totalRemaining)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Needs attention</p>
                <p
                  className={`mt-1 font-display text-3xl font-black ${
                    needsAttention > 0 ? "text-rose-300" : "text-emerald-200"
                  }`}
                >
                  {needsAttention}
                </p>
              </div>
            </div>
            <label className="flex min-w-[240px] flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Release reason (required)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
              />
            </label>
          </div>

          <p className="mb-4 text-xs text-zinc-500">
            "Needs attention" = blocked, sent to manual review, PayPal reported the payout failed / returned, or
            the seller doesn't have a verified PayPal email yet (so this can't be released no matter what).
            Releasing here calls the same PayPal Payouts API as the order detail page — it requires the order to be
            shipped (or delivered) and the seller's PayPal email to be verified. "Left to send" already subtracts any
            outstanding Get Vaulted shipping-label cost this seller still owes and any partial payments you've recorded —
            that's the real number to pay, not "Owed". Use "Partial payment" when you send part of a balance: enter
            what you sent and the page shows what's left. Use "Mark paid" only after you've already sent a seller their balance yourself (PayPal, Stripe,
            or otherwise) — it records the orders as settled and recovers any label liability, but never moves money.
          </p>

          {note ? (
            <p className="mb-4 rounded-lg border border-sky-400/25 bg-sky-950/30 px-3 py-2 text-sm text-sky-100">
              {note}
            </p>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {!data?.sellers.length ? (
            <p className="text-sm text-zinc-500">No paid orders are on the PayPal payout rail.</p>
          ) : (
            <div className={`${adminPanelClassName} overflow-x-auto`}>
              <table className="w-full min-w-[940px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-bold">Seller</th>
                    <th className="px-3 py-3 font-bold">PayPal email</th>
                    <th className="px-3 py-3 font-bold">Orders</th>
                    <th className="px-3 py-3 font-bold">Owed</th>
                    <th className="px-3 py-3 font-bold">Left to send</th>
                    <th className="px-3 py-3 font-bold">Needs attention</th>
                    <th className="px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellers.map((s) => {
                    const handle = s.username?.trim() || s.sellerId.slice(0, 8);
                    const isOpen = Boolean(expanded[s.sellerId]);
                    const emailReady = !s.blockedReason;
                    return (
                      <Fragment key={s.sellerId}>
                        <tr className="border-b border-white/[0.06] align-middle">
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/users/${encodeURIComponent(s.sellerId)}`}
                              className="font-semibold text-gold-bright hover:underline"
                            >
                              @{handle}
                            </Link>
                            {s.email ? <p className="text-[11px] text-zinc-500">{s.email}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-mono text-[11px] text-zinc-300">
                              {s.paypalPayoutEmail ?? "— not set —"}
                            </p>
                            <p
                              className={`text-[11px] ${emailReady ? "text-emerald-300/90" : "text-amber-200/90"}`}
                            >
                              {emailReady ? "Verified" : "Not verified"}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-mono text-zinc-200">
                            {s.orderCount}
                            {s.paidOutOrderCount > 0 ? (
                              <p className="text-[10px] text-zinc-500">{s.paidOutOrderCount} already paid</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 font-mono text-zinc-100">{money(s.owedUsd)}</td>
                          <td className="px-3 py-3 font-mono">
                            <p className="font-bold text-gold-bright">{money(s.remainingUsd)}</p>
                            {s.outstandingLiabilityUsd > 0 ? (
                              <p className="text-[10px] text-amber-200/90">
                                after −{money(s.outstandingLiabilityUsd)} label liability
                              </p>
                            ) : null}
                            {s.partialPaidUsd > 0 ? (
                              <p className="text-[10px] text-sky-200/90">
                                {money(s.partialPaidUsd)} sent so far · of {money(s.netOfLiabilityUsd)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            <span className={s.needsAttentionCount > 0 ? "text-rose-300" : "text-zinc-500"}>
                              {s.needsAttentionCount}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((prev) => ({ ...prev, [s.sellerId]: !prev[s.sellerId] }))
                                }
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
                              >
                                {isOpen ? "Hide orders" : "Show orders"}
                              </button>
                              <button
                                type="button"
                                disabled={s.remainingUsd <= 0}
                                onClick={() => openPartial(s)}
                                title="Record part of the balance you already sent this seller — the page then shows what is left"
                                className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-[11px] font-semibold text-gold-bright disabled:opacity-40 hover:bg-gold/15"
                              >
                                {partialFor === s.sellerId ? "Close" : "Partial payment"}
                              </button>
                              <button
                                type="button"
                                disabled={markingPaidSellerId === s.sellerId || s.orderCount === 0}
                                onClick={() => void markSellerPaid(s)}
                                title="Record that you already sent this seller their PayPal balance yourself — does not call PayPal"
                                className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-100 disabled:opacity-40 hover:bg-sky-500/15"
                              >
                                {markingPaidSellerId === s.sellerId ? "Marking\u2026" : "Mark paid"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {partialFor === s.sellerId || s.partialPayments.length > 0 ? (
                          <tr className="border-b border-white/[0.06] bg-sky-950/10">
                            <td colSpan={7} className="px-4 py-3">
                              {s.partialPayments.length > 0 ? (
                                <ul className="mb-2 space-y-1 text-xs text-zinc-300">
                                  {s.partialPayments.map((pp) => (
                                    <li key={pp.id} className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-sky-100">{money(pp.amountUsd)}</span>
                                      <span className="text-zinc-500">
                                        sent {new Date(pp.createdAt).toLocaleDateString()}
                                        {pp.note ? ` · ${pp.note}` : ""}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => void undoPartial(s, pp.id, pp.amountUsd)}
                                        className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
                                      >
                                        Undo
                                      </button>
                                    </li>
                                  ))}
                                  <li className="pt-1 text-[11px] text-amber-200/90">
                                    Automatic payouts for this seller are paused while a partial payment is open.
                                    Use Mark paid to settle the remaining {money(s.remainingUsd)}.
                                  </li>
                                </ul>
                              ) : null}
                              {partialFor === s.sellerId ? (
                                <div className="flex flex-wrap items-end gap-3">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                      Amount you already sent
                                    </span>
                                    <input
                                      id={`partial-amount-${s.sellerId}`}
                                      inputMode="decimal"
                                      value={partialAmount}
                                      onChange={(e) => setPartialAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                      placeholder="0.00"
                                      className="w-32 rounded-lg border border-white/10 bg-[#050506] px-3 py-2 font-mono text-sm text-zinc-100"
                                    />
                                  </label>
                                  <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                      Note (optional)
                                    </span>
                                    <input
                                      id={`partial-note-${s.sellerId}`}
                                      value={partialNote}
                                      onChange={(e) => setPartialNote(e.target.value)}
                                      placeholder="e.g. PayPal send on Oct 15"
                                      className="rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
                                    />
                                  </label>
                                  <div className="pb-2 text-xs text-zinc-400">
                                    Remaining after:{" "}
                                    <span className="font-mono font-bold text-gold-bright">
                                      {money(Math.max(0, Math.round((s.remainingUsd - (Number(partialAmount) || 0)) * 100) / 100))}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={partialBusy || !(Number(partialAmount) > 0)}
                                    onClick={() => void recordPartial(s)}
                                    className="rounded-lg border border-gold/40 bg-gold/15 px-4 py-2 text-xs font-semibold text-gold-bright disabled:opacity-40"
                                  >
                                    {partialBusy ? "Saving…" : "Record partial payment"}
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                        {isOpen ? (
                          <tr className="border-b border-white/[0.06] bg-black/20">
                            <td colSpan={7} className="px-4 py-3">
                              <ul className="divide-y divide-white/[0.05]">
                                {s.orders.map((o) => {
                                  const stage = payoutStageLabel(o);
                                  const alreadySent = Boolean(o.processorTransferId?.trim());
                                  const canRelease = !alreadySent && emailReady && s.partialPaidUsd <= 0;
                                  const busy = busyOrderId === o.orderId;
                                  return (
                                    <li key={o.orderId} className="flex flex-wrap items-start justify-between gap-3 py-3 text-xs">
                                      <div className="min-w-0">
                                        <Link
                                          href={`/admin/orders/${encodeURIComponent(o.orderId)}`}
                                          className="text-zinc-200 hover:text-gold-bright"
                                        >
                                          {o.itemTitle}
                                        </Link>
                                        <p className="mt-0.5 text-[11px] text-zinc-500">
                                          {o.orderId.slice(0, 10)}… · created {new Date(o.createdAt).toLocaleString()}
                                          {o.shippedAt ? ` · shipped ${new Date(o.shippedAt).toLocaleString()}` : ""}
                                        </p>
                                        <p className={`mt-0.5 font-semibold ${toneClasses(stage.tone)}`}>
                                          {stage.label}
                                          {o.paypalPayoutStatus ? ` (PayPal: ${o.paypalPayoutStatus})` : ""}
                                        </p>
                                        {o.processorTransferId ? (
                                          <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-600">
                                            {o.processorTransferId}
                                          </p>
                                        ) : null}
                                        {o.payoutBlockedReason ? (
                                          <p className="mt-0.5 text-[11px] text-amber-200/90">
                                            {o.payoutBlockedReason}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-col items-end gap-1.5">
                                        <span className="font-mono text-zinc-300">{money(o.estimatedNetUsd)}</span>
                                        {o.processingFeeUsd ? (
                                          <span className="text-[10px] text-zinc-500">
                                            after {money(o.processingFeeUsd)} processing
                                          </span>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={!canRelease || busy}
                                          onClick={() => void releaseOrder(o)}
                                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-40"
                                        >
                                          {busy ? "Releasing…" : alreadySent ? "Already sent" : s.partialPaidUsd > 0 ? "Partial on file" : "Release"}
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminCommandShell>
  );
}
