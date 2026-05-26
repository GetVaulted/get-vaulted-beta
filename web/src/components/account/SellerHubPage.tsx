"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";
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

type StripeDebugRequirements = {
  currentlyDue: string[];
  pendingVerification: string[];
  eventuallyDue: string[];
  disabledReason?: string | null;
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

type NextReadinessStep = "stripe" | "ship_from" | "ready";

function getNextReadinessStep(checks: LiveReadinessChecks): NextReadinessStep {
  if (!checks.hasStripeAccount || !checks.stripeChargesEnabled) return "stripe";
  if (!checks.hasShipFromAddress) return "ship_from";
  return "ready";
}

function payoutStatus(s: SellerPayload | null): "not_connected" | "pending" | "ready" {
  if (!s?.stripeAccountId) return "not_connected";
  if (!s.stripeOnboardingComplete) return "pending";
  return "ready";
}

export function SellerHubPage() {
  const router = useRouter();
  const { status } = useSession();
  const { activated, phase: setupPhase } = useSellerSetupState(status === "authenticated");
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
  });
  const [homeStats, setHomeStats] = useState<SellerHomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  /** From GET /api/account/seller — never use isStripeConfigured() in this client component (secret is server-only). */
  const [stripePlatformConfigured, setStripePlatformConfigured] = useState(false);
  const [stripeEmbedOpen, setStripeEmbedOpen] = useState(false);
  const [stripeEmbedFallbackHint, setStripeEmbedFallbackHint] = useState(false);
  const [stripeDebugBlockedBy, setStripeDebugBlockedBy] = useState<string[]>([]);
  const [stripeDebugRequirements, setStripeDebugRequirements] = useState<StripeDebugRequirements>({
    currentlyDue: [],
    pendingVerification: [],
    eventuallyDue: [],
    disabledReason: null,
  });
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
  const payoutsSectionRef = useRef<HTMLElement | null>(null);
  const shipFromSectionRef = useRef<HTMLElement | null>(null);
  const recommendedSectionRef = useRef<HTMLElement | null>(null);
  const [recommendedCategories, setRecommendedCategories] = useState<{ category: string; count: number }[]>([]);

  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipCountry, setShipCountry] = useState("");

  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  const scrollTo = useCallback((ref: { current: HTMLElement | null }) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const guideToNextReadinessStep = useCallback(
    async (opts?: { payoutsCompleteToast?: boolean }) => {
      if (opts?.payoutsCompleteToast) toast("Payouts setup complete.");
      router.push(SELLER_SETUP_PATH);
    },
    [router, toast],
  );

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
        });
        return;
      }
      const j = (await res.json()) as {
        seller?: SellerPayload;
        stripePlatformConfigured?: boolean;
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
      setStripePlatformConfigured(j.stripePlatformConfigured === true);
      setRecommendedCategories(Array.isArray(j.recommendedCategories) ? j.recommendedCategories : []);
      if (s) {
        setShipName(s.shipFromName ?? "");
        setShipStreet(s.shipFromStreet ?? "");
        setShipCity(s.shipFromCity ?? "");
        setShipState(s.shipFromState ?? "");
        setShipZip(s.shipFromZip ?? "");
        setShipCountry(s.shipFromCountry ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onStripeEmbedEnd = useCallback(() => {
    setStripeEmbedOpen(false);
    setStripeEmbedFallbackHint(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    if (loading || status !== "authenticated" || setupPhase === "loading") return;
    if (!activated) {
      router.replace(SELLER_SETUP_PATH);
    }
  }, [loading, activated, setupPhase, router, status]);

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
          debugStripeRequirements?: StripeDebugRequirements;
        };
        setStripeDebugBlockedBy([]);
        setStripeDebugRequirements(
          j.debugStripeRequirements ?? {
            currentlyDue: [],
            pendingVerification: [],
            eventuallyDue: [],
            disabledReason: null,
          },
        );
        if (j.stripeOnboardingComplete === true || j.stripeChargesEnabled === true) {
          setStripeEmbedOpen(false);
          setStripeEmbedFallbackHint(false);
          await load();
          await guideToNextReadinessStep({ payoutsCompleteToast: true });
        }
      } catch {
        // ignore intermittent polling failures while modal is open
      }
    };
    const id = window.setInterval(() => void poll(), 5000);
    return () => clearInterval(id);
  }, [stripeEmbedOpen, seller?.stripeOnboardingComplete, load, guideToNextReadinessStep]);

  const connectPayouts = async () => {
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

  const saveShipFrom = async () => {
    setSaveError(null);
    setSaveMsg(null);
    const required = [shipStreet, shipCity, shipState, shipZip, shipCountry].map((v) => v.trim());
    if (required.some((v) => !v)) {
      setSaveError("Please complete your address.");
      return;
    }

    setSaveBusy(true);
    try {
      const res = await fetch("/api/account/seller", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipFromName: shipName,
          shipFromStreet: shipStreet,
          shipFromCity: shipCity,
          shipFromState: shipState,
          shipFromZip: shipZip,
          shipFromCountry: shipCountry,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string; readiness?: LiveReadiness };
      if (!res.ok) {
        setSaveError(j.error ?? "Could not save your address.");
        return;
      }
      const successMsg = j.message ?? "Shipping address saved.";
      setSaveMsg(successMsg);
      toast(successMsg);
      if (j.readiness) setReadiness(j.readiness);
      await load();
      await guideToNextReadinessStep();
    } finally {
      setSaveBusy(false);
    }
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

  if (!activated) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Redirecting to seller setup…</div>
      </main>
    );
  }

  const ps = payoutStatus(seller);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="rounded-2xl border border-white/[0.09] bg-[linear-gradient(180deg,rgba(24,24,29,0.88)_0%,rgba(10,10,13,0.86)_100%)] p-5 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)] sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Active seller</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Seller HQ</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">Your command center for listings, sales, live shows, and orders.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/seller/live"
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110 sm:min-w-[160px] sm:w-auto"
            >
              Schedule Live Show
            </Link>
            <Link
              href="/account/listings/new"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright sm:min-w-[132px] sm:w-auto"
            >
              Create Listing
            </Link>
            <Link
              href={SELLER_SETUP_PATH}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-medium text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
            >
              Seller settings
            </Link>
          </div>
        </header>

        <nav className="mt-5 flex flex-wrap gap-2 border-b border-white/[0.07] pb-3" aria-label="Seller navigation">
          {[
            { href: "/account/seller", label: "HQ" },
            { href: "/seller/listings", label: "Listings" },
            { href: "/account/sales", label: "Sales" },
            { href: "/account/messages", label: "Messages" },
            { href: "/seller/live", label: "Live" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:px-3.5 ${
                item.href === "/account/seller"
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {loadError ? <p className="mt-4 text-sm font-medium text-amber-200">{loadError}</p> : null}
        {loadWarnings.length && !loadError ? (
          <p className="mt-4 text-sm text-amber-200/90">
            Some seller data could not be loaded ({loadWarnings.length} issue
            {loadWarnings.length === 1 ? "" : "s"}). Core settings are shown; retry or check migrations if counts look
            wrong.
          </p>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">My Live Events</p>
            <p className="mt-2 text-sm font-semibold text-zinc-100">
              {homeStats?.liveRoom ? homeStats.liveRoom.title : "No active or scheduled room"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {homeStats?.liveRoom?.status === "live"
                ? "Currently live"
                : homeStats?.liveRoom?.scheduledStartAt
                  ? `Scheduled ${new Date(homeStats.liveRoom.scheduledStartAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Start a room when you are ready."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/seller/live" className="inline-flex min-h-9 items-center rounded-full bg-gold px-4 py-2 text-xs font-bold text-zinc-950">
                Go Live
              </Link>
              <Link href="/seller/live" className="inline-flex min-h-9 items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200">
                My Live Events
              </Link>
            </div>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Listings</p>
            <p className="mt-2 text-sm text-zinc-300">Active listings: <span className="font-bold text-zinc-100">{homeStats?.activeListingsCount ?? 0}</span></p>
            <p className="mt-1 text-sm text-zinc-300">Draft listings: <span className="font-bold text-zinc-100">{homeStats?.draftListingsCount ?? 0}</span></p>
            <div className="mt-4">
              <Link href="/account/listings/new" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200">
                Create Listing
              </Link>
            </div>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Orders</p>
            <p className="mt-2 text-sm text-zinc-300">Open orders: <span className="font-bold text-zinc-100">{homeStats?.openOrdersCount ?? 0}</span></p>
            <p className="mt-1 text-sm text-zinc-300">Awaiting shipment: <span className="font-bold text-zinc-100">{homeStats?.awaitingShipmentCount ?? 0}</span></p>
            <p className="mt-1 text-sm text-zinc-300">Recent sales: <span className="font-bold text-zinc-100">{homeStats?.recentSalesCount ?? 0}</span></p>
            <div className="mt-4">
              <Link href="/account/sales" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200">
                Open Orders
              </Link>
            </div>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Messages</p>
            <p className="mt-2 text-sm text-zinc-300">Unread buyer messages: <span className="font-bold text-zinc-100">{homeStats?.unreadBuyerMessagesCount ?? 0}</span></p>
            <div className="mt-4">
              <Link href="/account/messages" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200">
                Open Messages
              </Link>
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Payouts</p>
          {ps === "ready" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-emerald-500/35 bg-emerald-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-200">
                Payouts ready
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void connectPayouts()}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright disabled:opacity-50"
              >
                {busy ? "Opening..." : "Manage payouts"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              <Link href={SELLER_SETUP_PATH} className="font-semibold text-gold-bright hover:underline">
                Complete seller setup
              </Link>{" "}
              to finish payout configuration.
            </p>
          )}
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
              <StripeOnboardingEmbed
                active={stripeEmbedOpen}
                onSessionEnd={onStripeEmbedEnd}
                onNeedsFallbackHint={() => setStripeEmbedFallbackHint(true)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );

}
