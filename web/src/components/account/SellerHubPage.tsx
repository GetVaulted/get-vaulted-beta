"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { SellerShipFromSetupCard } from "@/components/account/SellerShipFromSetupCard";
import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
import { SellerHubNav } from "@/components/seller/obs/SellerHubNav";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";
import { SELLER_OBS_PATH } from "@/lib/obs-seller-paths";
import { hasCompleteSellerShipFrom } from "@/lib/seller-shipping-readiness";
import { SELLER_SETUP_PATH } from "@/lib/seller-setup-state";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

type SellerPayload = {
  username: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  name: string | null;
  image: string | null;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  shipFromPhone: string | null;
};

type SellerHomeStats = {
  activeListingsCount: number;
  draftListingsCount: number;
  openOrdersCount: number;
  awaitingShipmentCount: number;
  recentSalesCount: number;
  unreadBuyerMessagesCount: number;
  liveRoom: {
    id: string;
    title: string;
    status: "live" | "scheduled";
    scheduledStartAt: string | null;
  } | null;
};

type LiveReadinessChecks = {
  hasStripeAccount: boolean;
  stripeChargesEnabled: boolean;
  hasShippoConfigured: boolean;
  hasShipFromAddress: boolean;
  alternateCheckoutSellerReady: boolean;
  hasAtLeastOneListingWithShippingProfile: boolean;
};

type LiveReadiness = {
  canGoLive: boolean;
  issues: string[];
  checks: LiveReadinessChecks;
};

function payoutStatus(s: SellerPayload | null): "not_connected" | "pending" | "ready" {
  if (!s?.stripeAccountId) return "not_connected";
  if (!s.stripeOnboardingComplete) return "pending";
  return "ready";
}

function HubSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{children}</p>
  );
}

function HubStatCard({
  label,
  lines,
  href,
  cta,
  highlight,
}: {
  label: string;
  lines: { text: string; emphasis?: boolean }[];
  href: string;
  cta: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-xl border p-4 transition hover:border-gold/25 hover:bg-white/[0.02] ${
        highlight
          ? "border-gold/20 bg-gold/[0.04]"
          : "border-white/[0.08] bg-zinc-950/40"
      }`}
    >
      <HubSectionLabel>{label}</HubSectionLabel>
      <div className="mt-2 space-y-0.5">
        {lines.map((line) => (
          <p
            key={line.text}
            className={`text-sm ${line.emphasis ? "font-semibold text-zinc-100" : "text-zinc-400"}`}
          >
            {line.text}
          </p>
        ))}
      </div>
      <span className="mt-3 inline-flex text-xs font-semibold text-gold-bright/90 group-hover:text-gold-bright">
        {cta} →
      </span>
    </Link>
  );
}

function StatusPill({ tone, children }: { tone: "ready" | "pending" | "warn"; children: ReactNode }) {
  const tones = {
    ready: "border-emerald-500/30 bg-emerald-950/50 text-emerald-200",
    pending: "border-amber-500/30 bg-amber-950/40 text-amber-100",
    warn: "border-rose-500/30 bg-rose-950/40 text-rose-100",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SellerHubPage() {
  const router = useRouter();
  const { status } = useSession();
  const { activated, phase: setupPhase, resolved: setupResolved } = useSellerSetupState(status === "authenticated");
  const [seller, setSeller] = useState<SellerPayload>({
    username: "",
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    name: null,
    image: null,
    shipFromName: null,
    shipFromStreet: null,
    shipFromCity: null,
    shipFromState: null,
    shipFromZip: null,
    shipFromCountry: null,
    shipFromPhone: null,
  });
  const [homeStats, setHomeStats] = useState<SellerHomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stripeEmbedOpen, setStripeEmbedOpen] = useState(false);
  const [stripeEmbedOnboardingAvailable, setStripeEmbedOnboardingAvailable] = useState(false);
  const [readiness, setReadiness] = useState<LiveReadiness>({
    canGoLive: false,
    issues: [],
    checks: {
      hasStripeAccount: false,
      stripeChargesEnabled: false,
      hasShippoConfigured: false,
      hasShipFromAddress: false,
      alternateCheckoutSellerReady: false,
      hasAtLeastOneListingWithShippingProfile: false,
    },
  });
  const shipFromSectionRef = useRef<HTMLElement | null>(null);

  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  const fetchLiveReadiness = useCallback(async (): Promise<LiveReadinessChecks | null> => {
    try {
      const res = await fetch("/api/seller/live-readiness", { cache: "no-store" });
      if (!res.ok) return null;
      const j = (await res.json()) as { checks?: LiveReadinessChecks };
      return j.checks ?? null;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoadWarnings([]);
    setLoading(true);
    try {
      const res = await fetch("/api/account/seller", { credentials: "same-origin" });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          detail?: string;
        };
        const detail =
          typeof errBody.error === "string" && errBody.error.trim() ? errBody.error.trim() : null;
        const debugDetail =
          typeof errBody.detail === "string" && errBody.detail.trim() ? errBody.detail.trim() : null;
        setLoadError(
          res.status === 401
            ? "Sign in to view seller settings."
            : res.status === 404 && errBody.code === "SESSION_USER_MISSING"
              ? (detail ??
                  "No account in this database for your current sign-in. Sign out, then sign in or sign up again.")
            : debugDetail
              ? `${detail ?? "Could not load seller settings."} (${debugDetail})`
              : detail ?? "Could not load seller settings.",
        );
        setSeller({
          username: "",
          stripeAccountId: null,
          stripeOnboardingComplete: false,
          name: null,
          image: null,
          shipFromName: null,
          shipFromStreet: null,
          shipFromCity: null,
          shipFromState: null,
          shipFromZip: null,
          shipFromCountry: null,
          shipFromPhone: null,
        });
        return;
      }
      const j = (await res.json()) as {
        seller?: SellerPayload;
        stripeEmbedOnboardingAvailable?: boolean;
        readiness?: LiveReadiness;
        sellerHomeStats?: SellerHomeStats;
        recommendedCategories?: { category: string; count: number }[];
        partialErrors?: string[];
        provisioned?: boolean;
      };
      if (Array.isArray(j.partialErrors) && j.partialErrors.length) {
        setLoadWarnings(j.partialErrors);
      }
      const s = j.seller ?? {
        username: "",
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        name: null,
        image: null,
        shipFromName: null,
        shipFromStreet: null,
        shipFromCity: null,
        shipFromState: null,
        shipFromZip: null,
        shipFromCountry: null,
        shipFromPhone: null,
      };
      setSeller(s);
      setReadiness(
        j.readiness ?? {
          canGoLive: false,
          issues: [],
          checks: {
            hasStripeAccount: false,
            stripeChargesEnabled: false,
            hasShippoConfigured: false,
            hasShipFromAddress: false,
            alternateCheckoutSellerReady: false,
            hasAtLeastOneListingWithShippingProfile: false,
          },
        },
      );
      setHomeStats(j.sellerHomeStats ?? null);
      setStripeEmbedOnboardingAvailable(j.stripeEmbedOnboardingAvailable === true);
    } finally {
      setLoading(false);
    }
  }, []);

  const onStripeEmbedEnd = useCallback(() => {
    setStripeEmbedOpen(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    if (loading || status !== "authenticated" || setupPhase === "loading" || !setupResolved) return;
    if (!activated) {
      router.replace(SELLER_SETUP_PATH);
    }
  }, [loading, activated, setupPhase, setupResolved, router, status]);

  useEffect(() => {
    if (!stripeEmbedOpen) return;
    if (seller?.stripeOnboardingComplete) {
      setStripeEmbedOpen(false);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/account/seller/stripe-status", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const j = (await res.json()) as {
          stripeOnboardingComplete?: boolean;
          stripeChargesEnabled?: boolean | null;
        };
        if (j.stripeOnboardingComplete === true || j.stripeChargesEnabled === true) {
          setStripeEmbedOpen(false);
          await load();
          toast("Payout setup updated.");
        }
      } catch {
        // ignore intermittent polling failures while modal is open
      }
    };
    const id = window.setInterval(() => void poll(), 5000);
    return () => clearInterval(id);
  }, [stripeEmbedOpen, seller?.stripeOnboardingComplete, load, toast]);

  const openStripeOnboarding = async () => {
    if (stripeEmbedOnboardingAvailable) {
      setStripeEmbedOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/seller/stripe/onboard", { method: "POST", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        setLoadError(j.error ?? "Could not start Stripe onboarding.");
        return;
      }
      if (j.url) window.location.assign(j.url);
    } finally {
      setBusy(false);
    }
  };

  const openStripeDashboard = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/connect/create-dashboard-link", {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        setLoadError(j.error ?? "Could not open Stripe dashboard.");
        return;
      }
      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const managePayouts = () => {
    if (payoutStatus(seller) === "ready") {
      void openStripeDashboard();
      return;
    }
    void openStripeOnboarding();
  };

  if (status === "unauthenticated") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-zinc-400">
          <Link href="/signin?returnTo=%2Faccount%2Fseller" className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to manage seller settings.
        </div>
      </main>
    );
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  if (!setupResolved || !activated) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">
          {setupResolved && !activated ? "Redirecting to seller setup…" : "Loading seller HQ…"}
        </div>
      </main>
    );
  }

  const ps = payoutStatus(seller);
  const liveRoom = homeStats?.liveRoom;
  const isLiveNow = liveRoom?.status === "live";
  const shipFromNeedsAttention = seller
    ? !hasCompleteSellerShipFrom({
        shipFromStreet: seller.shipFromStreet,
        shipFromCity: seller.shipFromCity,
        shipFromState: seller.shipFromState,
        shipFromZip: seller.shipFromZip,
        shipFromCountry: seller.shipFromCountry,
        shipFromPhone: seller.shipFromPhone,
      })
    : !readiness.checks.hasShipFromAddress;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[#030303]">
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:pt-8">
        <header className="border-b border-white/[0.06] pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <HubSectionLabel>Active seller</HubSectionLabel>
              <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Seller HQ
              </h1>
              <p className="mt-1 max-w-lg text-sm text-zinc-500">
                Listings, live shows, orders, and payout settings in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/seller/live"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 transition hover:brightness-110"
              >
                {isLiveNow ? "Enter live room" : "Schedule live show"}
              </Link>
              <Link
                href="/account/listings/new"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-white/12 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/30 hover:text-gold-bright"
              >
                New listing
              </Link>
            </div>
          </div>
          <div className="mt-4">
            <AccountOrdersNav active="seller" mode="seller" />
          </div>
        </header>

        <SellerHubNav activeHref="/account/seller" />

        {loadError ? (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
            {loadError}
          </p>
        ) : null}
        {loadWarnings.length && !loadError ? (
          <p className="mt-4 text-sm text-amber-200/90">
            Some seller data could not be loaded ({loadWarnings.length} issue
            {loadWarnings.length === 1 ? "" : "s"}).
          </p>
        ) : null}

        {isLiveNow && liveRoom ? (
          <div className="mt-6 rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gold-bright/80">Live now</p>
              <p className="mt-0.5 font-semibold text-zinc-100">{liveRoom.title}</p>
            </div>
            <Link
              href="/seller/live"
              className="mt-3 inline-flex h-9 items-center rounded-lg bg-gold px-4 text-xs font-bold text-zinc-950 sm:mt-0"
            >
              Open console
            </Link>
          </div>
        ) : null}

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HubStatCard
            label="Live"
            highlight={isLiveNow}
            href="/seller/live"
            cta={isLiveNow ? "Go to console" : "Open live hub"}
            lines={[
              {
                text: liveRoom?.title ?? "No scheduled show",
                emphasis: true,
              },
              {
                text: isLiveNow
                  ? "You are live"
                  : liveRoom?.scheduledStartAt
                    ? `Scheduled ${new Date(liveRoom.scheduledStartAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                    : "Schedule when you are ready",
              },
            ]}
          />
          <HubStatCard
            label="Listings"
            href="/seller/listings"
            cta="View listings"
            lines={[
              { text: `${homeStats?.activeListingsCount ?? 0} active`, emphasis: true },
              { text: `${homeStats?.draftListingsCount ?? 0} drafts` },
            ]}
          />
          <HubStatCard
            label="Orders"
            href="/account/sales"
            cta="Open orders"
            lines={[
              { text: `${homeStats?.openOrdersCount ?? 0} open`, emphasis: true },
              { text: `${homeStats?.awaitingShipmentCount ?? 0} awaiting shipment` },
            ]}
          />
          <HubStatCard
            label="Messages"
            href="/account/messages"
            cta="Open inbox"
            lines={[
              {
                text: `${homeStats?.unreadBuyerMessagesCount ?? 0} unread`,
                emphasis: (homeStats?.unreadBuyerMessagesCount ?? 0) > 0,
              },
              { text: "Buyer conversations" },
            ]}
          />
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">Seller essentials</h2>
            <Link
              href={SELLER_SETUP_PATH}
              className="text-xs font-medium text-zinc-500 transition hover:text-gold-bright"
            >
              All settings
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Payouts</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    {ps === "ready"
                      ? "Stripe is connected. View balances, payout schedule, and bank details in your dashboard."
                      : ps === "pending"
                        ? "Finish verifying your Stripe account to receive marketplace and live payouts."
                        : "Connect Stripe once to get paid for sales and live auctions."}
                  </p>
                </div>
                <StatusPill tone={ps === "ready" ? "ready" : ps === "pending" ? "pending" : "warn"}>
                  {ps === "ready" ? "Connected" : ps === "pending" ? "Pending" : "Setup"}
                </StatusPill>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => managePayouts()}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-white/[0.06] px-4 text-xs font-semibold text-zinc-100 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:ring-gold/25 disabled:opacity-50"
                >
                  {busy ? "Opening…" : ps === "ready" ? "Stripe dashboard" : "Connect payouts"}
                </button>
                {ps !== "ready" ? (
                  <Link
                    href={SELLER_SETUP_PATH}
                    className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
                  >
                    Setup wizard
                  </Link>
                ) : null}
              </div>
            </article>

            <article
              ref={shipFromSectionRef}
              className={`rounded-xl border p-4 sm:p-5 ${
                shipFromNeedsAttention
                  ? "border-amber-500/20 bg-amber-950/10"
                  : "border-white/[0.08] bg-zinc-950/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Ship-from</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    {shipFromNeedsAttention
                      ? seller.shipFromStreet?.trim()
                        ? "Address saved — add a contact phone for USPS labels."
                        : "Origin address and phone for Shippo labels after orders pay."
                      : "Origin address and phone on file for shipping labels."}
                  </p>
                </div>
                <StatusPill tone={shipFromNeedsAttention ? "pending" : "ready"}>
                  {shipFromNeedsAttention ? "Action needed" : "Ready"}
                </StatusPill>
              </div>
              <div className="mt-4">
                <SellerShipFromSetupCard
                  embedded
                  onSaved={async () => {
                    await load();
                    const checks = await fetchLiveReadiness();
                    if (checks) {
                      setReadiness((prev) => ({ ...prev, checks }));
                    }
                  }}
                />
              </div>
            </article>
          </div>
        </section>

        <section className="mt-8 flex flex-wrap gap-2 border-t border-white/[0.06] pt-6">
          <Link
            href={SELLER_OBS_PATH}
            className="inline-flex h-9 items-center rounded-lg border border-white/10 px-4 text-xs font-semibold text-zinc-400 transition hover:border-gold/25 hover:text-zinc-200"
          >
            OBS Studio
          </Link>
          <Link
            href="/account/seller/shipping"
            className="inline-flex h-9 items-center rounded-lg border border-white/10 px-4 text-xs font-semibold text-zinc-400 transition hover:border-gold/25 hover:text-zinc-200"
          >
            Shipping profiles
          </Link>
        </section>
      </div>

      {stripeEmbedOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-3 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="stripe-embed-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setStripeEmbedOpen(false);
              void load();
            }
          }}
        >
          <div className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#111114] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <h2 id="stripe-embed-title" className="font-display text-base font-bold text-foreground">
                Connect payouts
              </h2>
              <button
                type="button"
                onClick={() => {
                  setStripeEmbedOpen(false);
                  void load();
                }}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.06]"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#0f0f12] p-4">
              <StripeOnboardingEmbed active={stripeEmbedOpen} onSessionEnd={onStripeEmbedEnd} />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
