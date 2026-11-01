"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminUser360Panel } from "@/components/admin/AdminUser360Panel";
import { SellerLockPanel } from "@/components/admin/SellerLockPanel";
import { BuyerPurchaseLockPanel } from "@/components/admin/BuyerPurchaseLockPanel";
import {
  Panel,
  Pill,
  UserAlerts,
  UserRecentOrders,
  UserSafetyChecks,
  UserStatTiles,
  UserTags,
  fmtDate,
  initialsFor,
  useAdminUserSummary,
} from "@/components/admin/AdminUserSummaryParts";

type UserTab = "overview" | "orders" | "shows" | "money" | "seller" | "risk" | "account" | "history";
const USER_TABS: UserTab[] = ["overview", "orders", "shows", "money", "seller", "risk", "account", "history"];

type ChecklistItem = {
  key: string;
  label: string;
  met: boolean;
  pending?: boolean;
  current?: string;
};

type Summary = {
  seller: {
    id: string;
    username: string;
    email: string;
    payoutTier: string;
    sellerLevel: string;
    sellerLevelLabel: string;
    fastPayoutStatus: string;
    instantPayoutApprovalStatus: string;
    instantPayoutApprovalLabel: string;
    instantPayoutReviewDate: string | null;
    instantPayoutReviewNotes: string | null;
    instantPayoutRejectionReason: string | null;
    suspensionReason: string | null;
    limitOverrides: { perOrderUsd: number | null; dailyUsd: number | null; exposureUsd: number | null } | null;
    platformLimits: { perOrderUsd: number; dailyUsd: number; maxOutstandingUsd: number };
    platformFeeOverride: {
      percent: number | null;
      effectivePercent: number | null;
      reason: string | null;
      setAt: string | null;
      expiresAt: string | null;
      defaultMarketplacePercent: number;
      launchPromoSlotsUsed: number;
      launchPromoSlotsMax: number;
      canAssignPromoOverride: boolean;
    };
    payoutRiskLevel?: string;
    payoutHoldDays?: number;
    payoutReservePercent?: number;
    stripePayoutsEnabled?: boolean | null;
    hasStripeAccount?: boolean;
  };
  metrics: {
    lifetimeGmvUsd: number;
    completedOrders: number;
    accountStanding: string;
    cancellationRate: number;
    chargebackRate: number;
    disputeRate: number;
    accountAgeDays: number;
    fraudStatus: string;
    unresolvedDisputeCount: number;
    excessiveShippingDelayCount: number;
    dailyInstantPayoutUsd: number;
    outstandingInstantPayoutUsd: number;
    lifetimeInstantPayoutUsd: number;
  } | null;
  tierEvaluation: {
    effectiveTier: string;
    naturalTier: string;
    suspensionReasons: string[];
    checklist: ChecklistItem[];
  } | null;
  suspensionHistory: Array<{
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    previousStatus: string | null;
    newStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};

type ActivityItem = {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  at: string;
  href: string | null;
};

type ActivityPayload = { items: ActivityItem[]; lookbackDays: number };

type ReferralSnapshot = {
  referralCode: string | null;
  referredBy: { id: string; username: string } | null;
  referredAt: string | null;
  availableUsd: number;
  pendingUsd: number;
  reservedUsd: number;
  spentUsd: number;
  voidedUsd: number;
  successfulReferrals: number;
  referredUserCount: number;
  credits: Array<{
    id: string;
    status: string;
    role: string;
    amountUsd: number;
    createdAt: string;
    availableAt: string;
    voidReason: string | null;
    sourceOrder: { id: string; totalUsd: number; paymentStatus: string };
    spentOrderId: string | null;
  }>;
};

type PlatformCreditRow = {
  id: string;
  amountUsd: number;
  status: string;
  sourceType: string;
  sourceRef: string;
  spentOrderId: string | null;
  spentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

type PlatformCreditSnapshot = {
  availableUsd: number;
  pendingUsd: number;
  spentUsd: number;
  voidedUsd: number;
  credits: PlatformCreditRow[];
};

type AddressRow = {
  id: string;
  type: string;
  name: string;
  fullName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type AddressPayload = { addresses: AddressRow[] };

type LinkedPeer = {
  userId: string;
  username: string;
  email: string;
  suspendedAt: string | null;
  score: number;
  signals: Array<{ kind: string; label: string; evidence: string }>;
};

type LinkedPayload = { peers: LinkedPeer[] };

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function AdminUserDetailPage() {
  const params = useParams();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [overrideRequirements, setOverrideRequirements] = useState(false);
  const [perOrderLimit, setPerOrderLimit] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [exposureLimit, setExposureLimit] = useState("");
  const [platformFeePercent, setPlatformFeePercent] = useState("");
  const [platformFeeExpiresAt, setPlatformFeeExpiresAt] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [usernameReason, setUsernameReason] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [linked, setLinked] = useState<LinkedPayload | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(true);
  const [addresses, setAddresses] = useState<AddressRow[] | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [referral, setReferral] = useState<ReferralSnapshot | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [platformCredit, setPlatformCredit] = useState<PlatformCreditSnapshot | null>(null);
  const [platformCreditLoading, setPlatformCreditLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [creditMessage, setCreditMessage] = useState<string | null>(null);
  const summary = useAdminUserSummary(userId || null);
  // Tab lives in the URL hash so links like /admin/users/<id>#risk open the right section.
  // Safe to read on the client's first render: the page shows "Loading…" until its data arrives, so the tabs
  // are never part of the server-rendered markup.
  const [tab, setTabState] = useState<UserTab>(() => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.replace("#", "") as UserTab;
    return USER_TABS.includes(h) ? h : "overview";
  });
  const setTab = (t: UserTab) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  };

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/payout-tier`, { cache: "no-store" });
      if (!res.ok) {
        setData(null);
        return;
      }
      setData((await res.json()) as Summary);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setActivityLoading(true);
    setLinkedLoading(true);
    setReferralLoading(true);
    setPlatformCreditLoading(true);
    setAddressesLoading(true);
    void (async () => {
      try {
        const [actRes, linkRes, refRes, creditRes, addrRes] = await Promise.all([
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/activity`, { cache: "no-store" }),
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/linked-accounts`, { cache: "no-store" }),
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/referral-credits`, { cache: "no-store" }),
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/platform-credit`, { cache: "no-store" }),
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/addresses`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (actRes.ok) setActivity((await actRes.json()) as ActivityPayload);
        else setActivity(null);
        if (linkRes.ok) setLinked((await linkRes.json()) as LinkedPayload);
        else setLinked(null);
        if (refRes.ok) {
          const j = (await refRes.json()) as { referral?: ReferralSnapshot };
          setReferral(j.referral ?? null);
        } else setReferral(null);
        if (creditRes.ok) setPlatformCredit((await creditRes.json()) as PlatformCreditSnapshot);
        else setPlatformCredit(null);
        if (addrRes.ok) {
          const j = (await addrRes.json()) as AddressPayload;
          setAddresses(j.addresses);
        } else setAddresses(null);
      } finally {
        if (!cancelled) {
          setActivityLoading(false);
          setLinkedLoading(false);
          setReferralLoading(false);
          setPlatformCreditLoading(false);
          setAddressesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const changeUsername = async () => {
    if (!newUsername.trim()) {
      setError("Enter a new username.");
      return;
    }
    if (!usernameReason.trim()) {
      setError("Reason is required when changing a username.");
      return;
    }
    setUsernameBusy(true);
    setError(null);
    setUsernameMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_username",
          username: newUsername.trim(),
          reason: usernameReason.trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        username?: string;
        previousUsername?: string;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Username change failed.");
        return;
      }
      setUsernameMessage(
        j.previousUsername && j.username && j.previousUsername !== j.username
          ? `Username updated: @${j.previousUsername} → @${j.username}`
          : `Username set to @${j.username ?? newUsername.trim()}`,
      );
      setNewUsername("");
      setUsernameReason("");
      await load();
    } finally {
      setUsernameBusy(false);
    }
  };

  const grantCredit = async () => {
    const amount = Number(creditAmount);
    if (!creditReason.trim()) {
      setCreditError("Reason is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.01) {
      setCreditError("Enter an amount of at least $0.01.");
      return;
    }
    setCreditBusy(true);
    setCreditError(null);
    setCreditMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/platform-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amount, reason: creditReason.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as PlatformCreditSnapshot & { error?: string };
      if (!res.ok) {
        setCreditError(typeof j.error === "string" ? j.error : "Grant failed.");
        return;
      }
      setPlatformCredit(j);
      setCreditMessage(`Granted $${amount.toFixed(2)} in Get Vaulted Credit.`);
      setCreditAmount("");
      setCreditReason("");
    } finally {
      setCreditBusy(false);
    }
  };

  /** Unstick credit left in "reserved" limbo by a checkout attempt that never cleanly finished. */
  const releaseStuckCredit = async () => {
    setCreditBusy(true);
    setCreditError(null);
    setCreditMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/platform-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_stuck" }),
      });
      const j = (await res.json().catch(() => ({}))) as PlatformCreditSnapshot & {
        error?: string;
        releasedCount?: number;
      };
      if (!res.ok) {
        setCreditError(typeof j.error === "string" ? j.error : "Release failed.");
        return;
      }
      setPlatformCredit(j);
      setCreditMessage(
        (j.releasedCount ?? 0) > 0
          ? `Released ${j.releasedCount} stuck reservation(s) back to available.`
          : "No stuck reservations found — nothing to release.",
      );
    } finally {
      setCreditBusy(false);
    }
  };

  const act = async (action: string, extra?: Record<string, unknown>) => {
    if (action !== "recalculate" && !reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/payout-tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason.trim() || "recalculate",
          reviewNotes: reviewNotes.trim() || undefined,
          rejectionReason: rejectionReason.trim() || undefined,
          overrideRequirements,
          perOrderLimitUsd: perOrderLimit ? Number(perOrderLimit) : undefined,
          dailyLimitUsd: dailyLimit ? Number(dailyLimit) : undefined,
          exposureLimitUsd: exposureLimit ? Number(exposureLimit) : undefined,
          platformFeePercent: platformFeePercent ? Number(platformFeePercent) : undefined,
          platformFeeExpiresAt: platformFeeExpiresAt.trim() || undefined,
          ...extra,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Action failed.");
        return;
      }
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-16 text-center text-sm text-zinc-400 lg:px-8">Loading…</main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-16 text-center lg:px-8">
        <p className="text-sm text-zinc-400">User not found.</p>
        <Link href="/admin/users" className="mt-4 inline-block text-sm font-semibold text-gold-bright hover:underline">
          ← Users
        </Link>
      </main>
    );
  }

  const m = data.metrics;
  const limits = data.seller.platformLimits;
  const overrides = data.seller.limitOverrides;
  const feeOverride = data.seller.platformFeeOverride;
  const effectiveFeePercent = feeOverride.effectivePercent ?? feeOverride.defaultMarketplacePercent;
  const s = summary.summary;

  const tabs: Array<{ id: UserTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders & refunds", count: s ? s.buyer.paidOrders + s.seller.paidSales : undefined },
    { id: "shows", label: "Live shows" },
    { id: "money", label: "Credit & fees" },
    { id: "seller", label: "Seller program" },
    { id: "risk", label: "Risk & locks", count: s ? s.alerts.length || undefined : undefined },
    { id: "account", label: "Account & support" },
    { id: "history", label: "History" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 text-sm lg:px-8">
      <nav aria-label="Breadcrumb" className="text-[13px] text-zinc-400">
        <Link href="/admin/users-management" className="hover:text-gold-bright">
          Users
        </Link>
        <span aria-hidden className="px-1.5">
          /
        </span>
        <span className="text-zinc-200">@{data.seller.username}</span>
      </nav>

      <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-white/[0.08] bg-[#121216] p-6">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-br from-[#3a3220] to-[#1c1a14] text-xl font-semibold text-gold-bright">
          {s ? initialsFor(s.user) : (data.seller.username[0] ?? "?").toUpperCase()}
        </span>
        <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">@{data.seller.username}</h1>
            {s ? <UserTags summary={s} /> : null}
          </div>
          <p className="text-[13px] text-zinc-300">
            {[s?.user.name, data.seller.email, s?.user.phone].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[13px] text-zinc-400">
            {s ? `Joined ${fmtDate(s.user.createdAt)} · ` : ""}
            {m ? `${m.accountAgeDays} days on platform · ` : ""}
            <span className="font-mono text-xs">ID {userId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("account")} className={BTN}>
            Message / notes
          </button>
          <button type="button" onClick={() => setTab("money")} className={BTN}>
            Grant credit
          </button>
          <button type="button" onClick={() => setTab("risk")} className={BTN_DANGER}>
            Locks
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-rose-100">
          {error}
        </p>
      ) : null}
      {usernameMessage ? (
        <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 px-4 py-3 text-emerald-100">
          {usernameMessage}
        </p>
      ) : null}

      {s ? <UserAlerts summary={s} /> : null}
      {s ? <UserStatTiles summary={s} /> : summary.error ? <p className="text-rose-300">{summary.error}</p> : null}

      <div role="tablist" aria-label="User sections" className="flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`user-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`user-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-3.5 text-sm transition ${
              tab === t.id
                ? "border-gold font-semibold text-zinc-50"
                : "border-transparent font-medium text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
            {t.count ? <span className="ml-1.5 text-xs text-zinc-500">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`user-panel-${tab}`} aria-labelledby={`user-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              title="Recent orders"
              action={
                <button type="button" onClick={() => setTab("orders")} className="text-[13px] text-gold-bright hover:underline">
                  All orders →
                </button>
              }
              className="xl:col-span-2"
            >
              {s ? <UserRecentOrders summary={s} /> : <p className="text-zinc-400">Loading…</p>}
            </Panel>
            <Panel title="Safety">{s ? <UserSafetyChecks summary={s} /> : <p className="text-zinc-400">Loading…</p>}</Panel>
            <Panel
              title="Latest activity"
              action={
                <button type="button" onClick={() => setTab("history")} className="text-[13px] text-gold-bright hover:underline">
                  Full history →
                </button>
              }
              className="xl:col-span-2"
            >
              <ActivityList loading={activityLoading} activity={activity} limit={6} />
            </Panel>
            <Panel title="Seller snapshot">
              <dl className="flex flex-col text-[13px]">
                {[
                  ["Seller level", data.seller.sellerLevelLabel],
                  ["Payout tier", data.seller.payoutTier],
                  ["Instant payout", data.seller.instantPayoutApprovalLabel],
                  ["Platform fee", `${effectiveFeePercent}%${feeOverride.effectivePercent != null ? " (override)" : ""}`],
                  ["Stripe payouts", data.seller.hasStripeAccount ? (data.seller.stripePayoutsEnabled === false ? "Paused by Stripe" : "On") : "Not set up"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-t border-white/[0.06] py-2 first:border-t-0">
                    <dt className="text-zinc-400">{k}</dt>
                    <dd className="text-right capitalize text-zinc-100">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        ) : null}

        {tab === "orders" ? <AdminUser360Panel userId={userId} sections={["orders", "refunds"]} /> : null}
        {tab === "shows" ? <AdminUser360Panel userId={userId} sections={["shows"]} /> : null}

        {tab === "money" ? (
          <>
            <Panel title="Get Vaulted Credit">
              <p className="text-[13px] text-zinc-400">
                Spendable store credit (not withdrawable). Grants are logged with your reason to this user&apos;s history.
              </p>
              {creditError ? <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-rose-100">{creditError}</p> : null}
              {creditMessage ? <p role="status" className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-950/30 px-3 py-2 text-emerald-100">{creditMessage}</p> : null}
              {platformCreditLoading ? (
                <p className="mt-3 text-zinc-400">Loading…</p>
              ) : !platformCredit ? (
                <p className="mt-3 text-zinc-400">Could not load credit data.</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Figure label="Available" value={`$${platformCredit.availableUsd.toFixed(2)}`} tone="text-teal-300" />
                    <div>
                      <Figure label="Pending (in checkout)" value={`$${platformCredit.pendingUsd.toFixed(2)}`} tone="text-amber-300" />
                      {platformCredit.pendingUsd > 0 ? (
                        <button
                          type="button"
                          disabled={creditBusy}
                          onClick={() => void releaseStuckCredit()}
                          className="mt-1.5 min-h-[36px] rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 text-xs font-semibold text-amber-100 disabled:opacity-40"
                          title="If this has been sitting here longer than a checkout normally takes, it's likely stuck from an interrupted attempt — not lost, just not spendable until released."
                        >
                          {creditBusy ? "Releasing…" : "Release stuck reservations"}
                        </button>
                      ) : null}
                    </div>
                    <Figure label="Spent" value={`$${platformCredit.spentUsd.toFixed(2)}`} />
                    <Figure label="Voided" value={`$${platformCredit.voidedUsd.toFixed(2)}`} />
                  </div>
                  <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-white/[0.06] pt-5">
                    <label className="flex w-36 flex-col gap-1.5 text-xs text-zinc-400">
                      Amount (USD)
                      <input type="number" min={0.01} step={0.01} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="25.00" className={INPUT} />
                    </label>
                    <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5 text-xs text-zinc-400">
                      Reason (required)
                      <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Goodwill credit for delayed shipment, promo, testing…" className={INPUT} />
                    </label>
                    <button
                      type="button"
                      disabled={creditBusy || !creditAmount.trim() || !creditReason.trim()}
                      onClick={() => void grantCredit()}
                      className="min-h-[40px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-200 disabled:opacity-40"
                    >
                      {creditBusy ? "Granting…" : "Grant credit"}
                    </button>
                  </div>
                  <Ledger
                    empty="No credit ledger rows for this user."
                    rows={platformCredit.credits.map((c) => ({
                      id: c.id,
                      left: `${c.sourceType.replace(/_/g, " ")} · ${c.status}${c.voidReason ? ` (${c.voidReason})` : ""}`,
                      amount: c.amountUsd,
                      right: new Date(c.createdAt).toLocaleString(),
                    }))}
                  />
                </>
              )}
            </Panel>

            <Panel title="Referral credits" action={<Link href="/admin/referrals" className="text-[13px] text-gold-bright hover:underline">Referrals tracker →</Link>}>
              {referralLoading ? (
                <p className="text-zinc-400">Loading…</p>
              ) : !referral ? (
                <p className="text-zinc-400">Could not load referral data.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Figure label="Available" value={`$${referral.availableUsd.toFixed(2)}`} tone="text-teal-300" />
                    <Figure label="Pending" value={`$${referral.pendingUsd.toFixed(2)}`} tone="text-amber-300" />
                    <Figure label="Spent / voided" value={`$${referral.spentUsd.toFixed(2)} / $${referral.voidedUsd.toFixed(2)}`} />
                    <Figure label="Successful referrals" value={`${referral.successfulReferrals}`} sub={`${referral.referredUserCount} attributed signups`} />
                  </div>
                  <p className="mt-4 text-[13px] text-zinc-400">
                    Code: <span className="font-mono text-zinc-200">{referral.referralCode ?? "—"}</span>
                    {referral.referredBy ? (
                      <>
                        {" "}· Referred by{" "}
                        <Link href={`/admin/users/${encodeURIComponent(referral.referredBy.id)}`} className="text-gold-bright hover:underline">
                          @{referral.referredBy.username}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <Ledger
                    empty="No referral credit rows for this user."
                    rows={referral.credits.map((c) => ({
                      id: c.id,
                      left: `${c.role} · ${c.status}${c.voidReason ? ` (${c.voidReason})` : ""}`,
                      amount: c.amountUsd,
                      right: (
                        <Link href={`/admin/orders/${encodeURIComponent(c.sourceOrder.id)}`} className="text-sky-300 hover:underline">
                          source order
                        </Link>
                      ),
                    }))}
                  />
                </>
              )}
            </Panel>

            <Panel title="Launch promo fee (this seller only)">
              <p className="text-[13px] text-zinc-400">Only sellers you enroll here get a reduced fee; everyone else keeps the platform default.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Figure
                  label="Effective fee"
                  value={`${effectiveFeePercent}%`}
                  tone="text-gold-bright"
                  sub={feeOverride.effectivePercent != null ? "Override active" : `Platform default ${feeOverride.defaultMarketplacePercent}%`}
                />
                <Figure label="Launch promo slots" value={`${feeOverride.launchPromoSlotsUsed}/${feeOverride.launchPromoSlotsMax}`} sub="active" />
                {feeOverride.effectivePercent != null ? (
                  <Figure
                    label="Stored override"
                    value={`${feeOverride.percent}%`}
                    sub={`${feeOverride.reason ?? "No reason recorded"}${feeOverride.expiresAt ? ` · expires ${new Date(feeOverride.expiresAt).toLocaleString()}` : ""}`}
                  />
                ) : feeOverride.percent != null ? (
                  <p className="text-amber-200">Override is set but expired — seller uses the platform default.</p>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Fee % (0–25)
                  <input type="number" min={0} max={25} step={0.01} placeholder={`Default ${feeOverride.defaultMarketplacePercent}`} value={platformFeePercent} onChange={(e) => setPlatformFeePercent(e.target.value)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Expires (optional)
                  <input type="datetime-local" value={platformFeeExpiresAt} onChange={(e) => setPlatformFeeExpiresAt(e.target.value)} className={INPUT} />
                </label>
              </div>
              <ReasonField reason={reason} setReason={setReason} />
              {!feeOverride.canAssignPromoOverride ? (
                <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-950/30 px-3 py-2 text-amber-100">
                  All {feeOverride.launchPromoSlotsMax} launch promo slots are in use. Clear one before enrolling another seller.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy || !platformFeePercent.trim() || !feeOverride.canAssignPromoOverride} onClick={() => void act("override_platform_fee")} className={BTN_GOLD}>
                  Set fee override
                </button>
                <button type="button" disabled={busy || feeOverride.percent == null} onClick={() => void act("clear_platform_fee_override")} className={BTN}>
                  Clear override
                </button>
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "seller" ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Seller level">
                <p className="text-xl font-semibold text-gold-bright">{data.seller.sellerLevelLabel}</p>
                <KV k="Payout tier" v={data.seller.payoutTier} />
                <KV k="Natural tier" v={data.tierEvaluation?.naturalTier ?? "—"} />
                <KV k="Fast payout" v={data.seller.fastPayoutStatus.replace(/_/g, " ")} />
              </Panel>
              <Panel title="Instant payout">
                <p className="text-base font-semibold text-zinc-50">{data.seller.instantPayoutApprovalLabel}</p>
                {data.seller.instantPayoutReviewDate ? <p className="mt-1 text-[13px] text-zinc-400">Reviewed {new Date(data.seller.instantPayoutReviewDate).toLocaleString()}</p> : null}
                {data.seller.instantPayoutReviewNotes ? <p className="mt-2 text-[13px] text-zinc-300">Notes: {data.seller.instantPayoutReviewNotes}</p> : null}
                {data.seller.instantPayoutRejectionReason ? <p className="mt-2 text-[13px] text-amber-200">Rejection: {data.seller.instantPayoutRejectionReason}</p> : null}
                {data.seller.suspensionReason ? <p className="mt-2 text-[13px] text-rose-300">Suspended: {data.seller.suspensionReason}</p> : null}
              </Panel>
              <Panel title="Instant payout exposure">
                <KV k="Today" v={`${formatUsd(m?.dailyInstantPayoutUsd ?? 0)} of ${formatUsd(overrides?.dailyUsd ?? limits.dailyUsd)}`} />
                <KV k="Outstanding" v={`${formatUsd(m?.outstandingInstantPayoutUsd ?? 0)} of ${formatUsd(overrides?.exposureUsd ?? limits.maxOutstandingUsd)}`} />
                <KV k="Lifetime" v={formatUsd(m?.lifetimeInstantPayoutUsd ?? 0)} />
                <KV k="Per-order limit" v={formatUsd(overrides?.perOrderUsd ?? limits.perOrderUsd)} />
              </Panel>
            </div>

            {m ? (
              <Panel title="Seller risk metrics">
                <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
                  <KV k="Lifetime GMV" v={`$${m.lifetimeGmvUsd.toLocaleString()}`} />
                  <KV k="Completed orders" v={String(m.completedOrders)} />
                  <KV k="Account standing" v={m.accountStanding.replace(/_/g, " ")} />
                  <KV k="Account age" v={`${m.accountAgeDays} days`} />
                  <KV k="Cancellation rate" v={pct(m.cancellationRate)} />
                  <KV k="Chargeback rate" v={pct(m.chargebackRate)} />
                  <KV k="Dispute rate" v={pct(m.disputeRate)} />
                  <KV k="Fraud status" v={m.fraudStatus} />
                </div>
              </Panel>
            ) : null}

            {data.tierEvaluation?.checklist?.length ? (
              <Panel title="Instant payout eligibility">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.tierEvaluation.checklist.map((item) => (
                    <li key={item.key} className="flex items-start gap-2 text-[13px]">
                      <span aria-hidden className={item.met ? "text-teal-300" : item.pending ? "text-amber-300" : "text-zinc-500"}>
                        {item.met ? "✓" : item.pending ? "◷" : "○"}
                      </span>
                      <span className="text-zinc-200">
                        {item.label}
                        {item.current ? <span className="text-zinc-400"> · {item.current}</span> : null}
                        <span className="sr-only">{item.met ? " (met)" : item.pending ? " (pending)" : " (not met)"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            <Panel title="Seller program actions">
              <ReasonField reason={reason} setReason={setReason} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Review / approval notes
                  <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Rejection reason
                  <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} className={INPUT} />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[13px] text-zinc-300">
                <input type="checkbox" checked={overrideRequirements} onChange={(e) => setOverrideRequirements(e.target.checked)} className="h-4 w-4" />
                Override eligibility requirements on approval
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Per-order limit
                  <input type="number" placeholder={`$${limits.perOrderUsd}`} value={perOrderLimit} onChange={(e) => setPerOrderLimit(e.target.value)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Daily limit
                  <input type="number" placeholder={`$${limits.dailyUsd}`} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  Exposure limit
                  <input type="number" placeholder={`$${limits.maxOutstandingUsd}`} value={exposureLimit} onChange={(e) => setExposureLimit(e.target.value)} className={INPUT} />
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <ActionRow label="Instant payout">
                  <button type="button" disabled={busy} onClick={() => void act("start_instant_review")} className={BTN}>Start review</button>
                  <button type="button" disabled={busy} onClick={() => void act("approve_instant_payout")} className={BTN_GOLD}>Approve</button>
                  <button type="button" disabled={busy} onClick={() => void act("reject_instant_payout")} className={BTN}>Reject application</button>
                  <button type="button" disabled={busy} onClick={() => void act("suspend_instant_payout")} className={BTN_DANGER}>Suspend instant payout</button>
                  <button type="button" disabled={busy} onClick={() => void act("restore_instant_payout")} className={BTN}>Restore seller status</button>
                </ActionRow>
                <ActionRow label="Limits & status">
                  <button type="button" disabled={busy} onClick={() => void act("override_instant_limits")} className={BTN}>Override limits</button>
                  <button type="button" disabled={busy} onClick={() => void act("grant_fast_payout")} className={BTN}>Grant fast payout</button>
                  <button type="button" disabled={busy} onClick={() => void act("assign_elite_vault_verified")} className={BTN_GOLD}>Assign Elite Vault Verified</button>
                  <button type="button" disabled={busy} onClick={() => void act("remove_elite_vault_verified")} className={BTN}>Remove Elite</button>
                  <button type="button" disabled={busy} onClick={() => void act("recalculate")} className={BTN}>Recalculate tier</button>
                </ActionRow>
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "risk" ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Safety checks">{s ? <UserSafetyChecks summary={s} /> : <p className="text-zinc-400">Loading…</p>}</Panel>
              <Panel title="Possible linked accounts" action={<Link href="/admin/trust/linked-accounts" className="text-[13px] text-gold-bright hover:underline">Platform scan →</Link>}>
                <p className="text-[13px] text-zinc-400">Shared Stripe, payment, device, email or ship-to signals.</p>
                {linkedLoading ? (
                  <p className="mt-3 text-zinc-400">Loading…</p>
                ) : !linked?.peers.length ? (
                  <p className="mt-3 text-zinc-400">No linked-account signals found for this user.</p>
                ) : (
                  <ul className="mt-3 flex max-h-80 flex-col overflow-y-auto">
                    {linked.peers.map((peer) => (
                      <li key={peer.userId} className="flex items-start justify-between gap-3 border-t border-white/[0.06] py-2.5 first:border-t-0">
                        <div className="min-w-0 text-[13px]">
                          <Link href={`/admin/users/${encodeURIComponent(peer.userId)}`} className="font-semibold text-gold-bright hover:underline">
                            @{peer.username}
                          </Link>
                          <span className="ml-2 text-zinc-400">{peer.email}</span>
                          {peer.suspendedAt ? <span className="ml-2 text-rose-300">Suspended</span> : null}
                          <p className="mt-0.5 text-zinc-400">{peer.signals.map((sg) => sg.label).join(" · ")}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[13px] text-amber-200">score {peer.score}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="[&>section]:mt-0 grid gap-4 lg:grid-cols-2">
              <BuyerPurchaseLockPanel userId={userId} />
              <SellerLockPanel userId={userId} />
            </div>
          </>
        ) : null}

        {tab === "account" ? (
          <>
            <AdminUser360Panel userId={userId} sections={["notes", "tickets"]} />
            <Panel title="Addresses">
              {addressesLoading ? (
                <p className="text-zinc-400">Loading…</p>
              ) : !addresses?.length ? (
                <p className="text-zinc-400">No addresses saved for this user.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {addresses.map((a) => (
                    <li key={a.id} className="rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-4 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold capitalize text-gold-bright">{a.type.replace(/_/g, " ")}</span>
                        <span className="flex gap-1">
                          {a.isDefault ? <Pill tone="good">Default</Pill> : null}
                          {a.isVerified ? <Pill tone="info">Verified</Pill> : null}
                        </span>
                      </div>
                      <p className="mt-2 font-semibold text-zinc-100">{a.fullName}</p>
                      {a.company ? <p className="text-zinc-400">{a.company}</p> : null}
                      <p className="mt-1 text-zinc-300">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}
                      </p>
                      <p className="text-zinc-300">
                        {a.city}, {a.state} {a.postalCode} · {a.country}
                      </p>
                      {a.phone ? <p className="mt-1 text-zinc-400">{a.phone}</p> : null}
                      {a.email ? <p className="text-zinc-400">{a.email}</p> : null}
                      <p className="mt-2 text-xs text-zinc-500">Updated {new Date(a.updatedAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Change username">
              <p className="text-[13px] text-zinc-400">
                Fix typos or mistaken usernames. Skips the 60-day self-service lock; still enforces uniqueness and reserved names.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-xs text-zinc-400">
                  New username
                  <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className={INPUT} placeholder={`currently @${data.seller.username}`} autoComplete="off" spellCheck={false} />
                </label>
                <label className="flex min-w-[16rem] flex-[2] flex-col gap-1.5 text-xs text-zinc-400">
                  Reason
                  <input value={usernameReason} onChange={(e) => setUsernameReason(e.target.value)} className={INPUT} placeholder="User typo / support request" />
                </label>
                <button type="button" disabled={usernameBusy} onClick={() => void changeUsername()} className={BTN_GOLD}>
                  {usernameBusy ? "Saving…" : "Set username"}
                </button>
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "history" ? (
          <>
            <Panel title="Activity">
              <p className="mb-2 text-[13px] text-zinc-400">
                Last {activity?.lookbackDays ?? 90} days · joins, chats, bids and orders (silent viewers may not appear).
              </p>
              <ActivityList loading={activityLoading} activity={activity} />
            </Panel>
            <AdminUser360Panel userId={userId} sections={["adminLog"]} />
            {data.suspensionHistory.length > 0 ? (
              <Panel title="Suspension history">
                <LogList rows={data.suspensionHistory.map((l) => ({ id: l.id, action: l.action, detail: l.reason, at: l.createdAt }))} />
              </Panel>
            ) : null}
            {data.auditLogs.length > 0 ? (
              <Panel title="Payout program audit log">
                <LogList
                  rows={data.auditLogs.map((l) => ({
                    id: l.id,
                    action: `${l.action}${l.previousStatus || l.newStatus ? ` · ${l.previousStatus ?? "—"} → ${l.newStatus ?? "—"}` : ""}`,
                    detail: l.reason,
                    at: l.createdAt,
                  }))}
                />
              </Panel>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

const INPUT =
  "rounded-lg border border-white/10 bg-[#0b0b0e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none";
const BTN =
  "min-h-[40px] rounded-lg border border-white/15 bg-[#18181d] px-3.5 text-sm font-medium text-zinc-100 hover:bg-white/[0.06] disabled:opacity-50";
const BTN_GOLD =
  "min-h-[40px] rounded-lg border border-gold/40 bg-gold/10 px-3.5 text-sm font-semibold text-gold-bright hover:bg-gold/15 disabled:opacity-50";
const BTN_DANGER =
  "min-h-[40px] rounded-lg border border-red-400/40 bg-red-400/[0.08] px-3.5 text-sm font-medium text-red-200 hover:bg-red-400/15 disabled:opacity-50";

function Figure({ label, value, sub, tone = "text-zinc-50" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`font-mono text-lg font-semibold ${tone}`}>{value}</p>
      {sub ? <p className="text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-white/[0.06] py-2 text-[13px] first:border-t-0">
      <span className="text-zinc-400">{k}</span>
      <span className="text-right capitalize text-zinc-100">{v}</span>
    </div>
  );
}

function ReasonField({ reason, setReason }: { reason: string; setReason: (v: string) => void }) {
  return (
    <label className="mt-4 flex flex-col gap-1.5 text-xs text-zinc-400">
      Reason (required, saved to the audit log)
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={INPUT} placeholder="Why is this action being taken…" />
    </label>
  );
}

function ActionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </div>
  );
}

function Ledger({ rows, empty }: { rows: Array<{ id: string; left: string; amount: number; right: React.ReactNode }>; empty: string }) {
  if (rows.length === 0) return <p className="mt-4 text-[13px] text-zinc-400">{empty}</p>;
  return (
    <ul className="mt-4 max-h-56 overflow-y-auto border-t border-white/[0.06]">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] py-2 text-[13px]">
          <span className="capitalize text-zinc-300">{r.left}</span>
          <span className="ml-auto font-mono text-zinc-100">${r.amount.toFixed(2)}</span>
          <span className="text-zinc-400">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

function LogList({ rows }: { rows: Array<{ id: string; action: string; detail: string | null; at: string }> }) {
  return (
    <ul className="flex flex-col">
      {rows.map((l) => (
        <li key={l.id} className="border-t border-white/[0.06] py-2.5 text-[13px] first:border-t-0">
          <div className="flex flex-wrap justify-between gap-3">
            <span className="font-mono text-zinc-200">{l.action}</span>
            <time className="text-zinc-400">{new Date(l.at).toLocaleString()}</time>
          </div>
          {l.detail ? <p className="mt-0.5 text-zinc-400">{l.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ActivityList({ loading, activity, limit }: { loading: boolean; activity: ActivityPayload | null; limit?: number }) {
  if (loading) return <p className="text-zinc-400">Loading…</p>;
  const items = activity?.items ?? [];
  if (items.length === 0) return <p className="text-zinc-400">No recorded activity in this window.</p>;
  return (
    <ol className="flex max-h-[28rem] flex-col overflow-y-auto">
      {(limit ? items.slice(0, limit) : items).map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-white/[0.06] py-2.5 text-[13px] first:border-t-0">
          <time className="w-40 shrink-0 text-zinc-400">{new Date(item.at).toLocaleString()}</time>
          <span className="min-w-0 flex-1">
            {item.href ? (
              <Link href={item.href} className="font-medium text-gold-bright hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-zinc-100">{item.label}</span>
            )}
            {item.detail ? <span className="block text-zinc-400">{item.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
