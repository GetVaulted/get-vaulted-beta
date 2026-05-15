"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StripeOnboardingEmbed } from "@/components/seller/StripeOnboardingEmbed";
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
  const { status } = useSession();
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
      const checks = await fetchLiveReadiness();
      if (!checks) {
        if (opts?.payoutsCompleteToast) toast("Payouts setup complete.");
        return;
      }
      const step = getNextReadinessStep(checks);
      if (opts?.payoutsCompleteToast) toast("Payouts setup complete.");
      if (step === "stripe") {
        scrollTo(payoutsSectionRef);
        toast("Next step: set up payouts.");
      } else if (step === "ship_from") {
        scrollTo(shipFromSectionRef);
        toast("Next step: add your shipping address.");
      } else if (step === "ready") {
        toast("You're ready to go live!");
      }
    },
    [fetchLiveReadiness, scrollTo, toast],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/seller", { credentials: "same-origin" });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        const detail =
          typeof errBody.error === "string" && errBody.error.trim() ? errBody.error.trim() : null;
        setLoadError(
          res.status === 401
            ? "Sign in to view seller settings."
            : res.status === 404 && errBody.code === "SESSION_USER_MISSING"
              ? (detail ??
                  "No account in this database for your current sign-in. Sign out, then sign in or sign up again.")
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
      };
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
    if (!stripeEmbedOpen) return;
    if (seller?.stripeOnboardingComplete) {
      setStripeEmbedOpen(false);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/account/seller/stripe-status", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as {
          stripeOnboardingComplete?: boolean;
          debugStripeOnboardingBlockedBy?: string[];
          debugStripeRequirements?: StripeDebugRequirements;
        };
        setStripeDebugBlockedBy(Array.isArray(j.debugStripeOnboardingBlockedBy) ? j.debugStripeOnboardingBlockedBy : []);
        setStripeDebugRequirements(
          j.debugStripeRequirements ?? {
            currentlyDue: [],
            pendingVerification: [],
            eventuallyDue: [],
            disabledReason: null,
          },
        );
        if (j.stripeOnboardingComplete === true) {
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
      const res = await fetch("/api/seller/stripe/onboard", { method: "POST" });
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

  const ps = payoutStatus(seller);
  const requiredDone =
    Boolean(readiness?.checks.hasStripeAccount && readiness?.checks.stripeChargesEnabled) &&
    Boolean(readiness?.checks.hasShipFromAddress);
  const recommendedDone = [
    Boolean(seller?.image),
    (seller?.name ?? "").trim().length > 0,
    recommendedCategories.length > 0,
  ].filter(Boolean).length;
  const setupCompleted = (requiredDone ? 2 : 0) + recommendedDone;
  const setupTotal = 7;
  const sellerProfileHref = seller.username ? `/seller/${encodeURIComponent(seller.username)}` : "/account/seller";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="rounded-2xl border border-white/[0.09] bg-[linear-gradient(180deg,rgba(24,24,29,0.88)_0%,rgba(10,10,13,0.86)_100%)] p-5 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)] sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Seller Home</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">Manage your selling, live rooms, listings, and orders.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {requiredDone ? (
              <Link
                href="/seller/live"
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110 sm:min-w-[160px] sm:w-auto"
              >
                Schedule Live Show
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => scrollTo(payoutsSectionRef)}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-bold text-gold-bright transition hover:border-gold/55 sm:min-w-[160px] sm:w-auto"
              >
                Schedule Live Show
              </button>
            )}
            <Link
              href="/account/listings/new"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright sm:min-w-[132px] sm:w-auto"
            >
              Create Listing
            </Link>
          </div>
        </header>

        <nav className="mt-5 flex flex-wrap gap-2 border-b border-white/[0.07] pb-3" aria-label="Seller navigation">
          {[
            { href: "/account/seller", label: "Home" },
            { href: "/account/listings", label: "Listings" },
            { href: "/account/sales", label: "Orders" },
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

        <section className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Setup progress</p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">{setupCompleted}/{setupTotal} complete</p>
            </div>
            {requiredDone ? (
              <span className="rounded-full border border-emerald-500/35 bg-emerald-950/40 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                Ready for live
              </span>
            ) : (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gold-bright">
                Finish required setup
              </span>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Required setup</p>
              <ul className="mt-2 space-y-2.5 text-sm text-zinc-300">
                <li className="flex items-center justify-between">
                  <span>Payouts setup</span>
                  <span className="text-emerald-300">
                    {readiness?.checks.hasStripeAccount && readiness?.checks.stripeChargesEnabled ? "Added" : "Needed"}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Shipping address</span>
                  <span className="text-emerald-300">{readiness?.checks.hasShipFromAddress ? "Added" : "Needed"}</span>
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => scrollTo(payoutsSectionRef)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-gold/35"
                >
                  {readiness?.checks.hasStripeAccount && readiness?.checks.stripeChargesEnabled ? "Manage payouts" : "Continue setup"}
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo(shipFromSectionRef)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-gold/35"
                >
                  {readiness?.checks.hasShipFromAddress ? "Edit shipping address" : "Add shipping address"}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Recommended setup</p>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-400">
                <li>Profile photo</li>
                <li>Banner image</li>
                <li>Bio</li>
                <li>Social links</li>
                <li>Favorite categories</li>
              </ul>
              <button
                type="button"
                onClick={() => scrollTo(recommendedSectionRef)}
                className="mt-3 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-gold/35"
              >
                Open recommended setup
              </button>
            </div>
          </div>
        </section>

        <section ref={payoutsSectionRef} className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
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
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold-bright">
                Finish payouts setup
              </span>
              <button
                type="button"
                disabled={!stripePlatformConfigured || busy}
                onClick={() => {
                  setStripeEmbedFallbackHint(false);
                  setStripeEmbedOpen(true);
                }}
                className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-50"
              >
                Continue setup
              </button>
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live Rooms</p>
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
                Manage live rooms
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

        <section ref={shipFromSectionRef} className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Shipping Address</p>
          <p className="mt-2 text-sm text-zinc-400">Add or update your shipping address for seller orders.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-zinc-400">Name / company</span><input value={shipName} onChange={(e) => setShipName(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-zinc-400">Street</span><input value={shipStreet} onChange={(e) => setShipStreet(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
            <label><span className="mb-1 block text-xs font-medium text-zinc-400">City</span><input value={shipCity} onChange={(e) => setShipCity(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
            <label><span className="mb-1 block text-xs font-medium text-zinc-400">State</span><input value={shipState} onChange={(e) => setShipState(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
            <label><span className="mb-1 block text-xs font-medium text-zinc-400">ZIP</span><input value={shipZip} onChange={(e) => setShipZip(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
            <label><span className="mb-1 block text-xs font-medium text-zinc-400">Country</span><input value={shipCountry} onChange={(e) => setShipCountry(e.target.value)} placeholder="US" className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40" /></label>
          </div>
          {saveError ? <p className="mt-3 text-sm font-medium text-amber-200">{saveError}</p> : null}
          {saveMsg ? <p className="mt-3 text-sm font-medium text-emerald-200">{saveMsg}</p> : null}
          <button type="button" disabled={saveBusy} onClick={() => void saveShipFrom()} className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-white/[0.14] px-8 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:bg-white/[0.04] disabled:opacity-50">
            {saveBusy ? "Saving..." : "Save shipping address"}
          </button>
        </section>

        <section ref={recommendedSectionRef} className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Build your seller profile</p>
          <p className="mt-2 text-sm text-zinc-400">Optional upgrades to help buyers trust your shop.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-full border border-white/[0.10] bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-200">{recommendedDone}/3 suggestions complete</span>
            <span className="text-xs text-zinc-500">Optional and non-blocking</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
              <span className="text-zinc-300">Profile photo</span>
              <Link href={sellerProfileHref} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                Open profile
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
              <span className="text-zinc-300">Banner image</span>
              <span className="cursor-not-allowed rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-[11px] font-semibold text-zinc-500">Not built yet</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
              <span className="text-zinc-300">Bio</span>
              <Link href={sellerProfileHref} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                Open profile
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
              <span className="text-zinc-300">Social links</span>
              <span className="cursor-not-allowed rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-[11px] font-semibold text-zinc-500">Not built yet</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
              <span className="text-zinc-300">Favorite categories</span>
              <Link href="/account/listings" className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                Open listings
              </Link>
            </div>
          </div>
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
