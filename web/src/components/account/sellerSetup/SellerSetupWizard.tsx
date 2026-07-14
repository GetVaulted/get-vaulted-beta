"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompletionStep } from "@/components/account/sellerSetup/steps/CompletionStep";
import { PayoutStep } from "@/components/account/sellerSetup/steps/PayoutStep";
import { ProfileStep } from "@/components/account/sellerSetup/steps/ProfileStep";
import { ShippingStep } from "@/components/account/sellerSetup/steps/ShippingStep";
import { WelcomeStep } from "@/components/account/sellerSetup/steps/WelcomeStep";
import { WizardShell } from "@/components/account/sellerSetup/WizardShell";
import { SELLER_SHIP_FROM_COUNTRY, sellerNeedsShipFromPhoneOnly } from "@/lib/seller-shipping-readiness";
import {
  isPayoutSetupComplete,
  isPayoutSetupSubmitted,
  isRequiredSellerSetupComplete,
  SELLER_HQ_PATH,
} from "@/lib/seller-setup-state";
import {
  clearSellerWizardComplete,
  persistSellerWizardComplete,
  readSellerWizardComplete,
  resolveSellerWizardStep,
  type SellerWizardStep,
} from "@/lib/seller-setup-wizard";
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

type LiveReadinessChecks = {
  hasStripeAccount: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutSubmitted: boolean;
  hasShipFromAddress: boolean;
};

type LiveReadiness = {
  checks: LiveReadinessChecks;
};

export function SellerSetupWizard() {
  const router = useRouter();
  const { status } = useSession();
  const [seller, setSeller] = useState<SellerPayload | null>(null);
  const [readiness, setReadiness] = useState<LiveReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<SellerWizardStep>(1);
  const [stepReady, setStepReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [payoutReconciling, setPayoutReconciling] = useState(false);
  const [payoutReconcileError, setPayoutReconcileError] = useState<string | null>(null);
  const payoutReconcileAbortRef = useRef(false);
  const [stripePlatformConfigured, setStripePlatformConfigured] = useState(false);
  const [stripeEmbedOnboardingAvailable, setStripeEmbedOnboardingAvailable] = useState(false);
  const [stripeEmbedOpen, setStripeEmbedOpen] = useState(false);

  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const [shippingSaved, setShippingSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [sellerAgreementAccepted, setSellerAgreementAccepted] = useState(false);
  const stepInitializedRef = useRef(false);
  const stripeReturnHandledRef = useRef(false);
  const searchParams = useSearchParams();

  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/seller", { credentials: "same-origin" });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(errBody.error ?? "Could not load seller setup.");
        return;
      }
      const j = (await res.json()) as {
        seller?: SellerPayload & { shipFromPhone?: string | null };
        shipFromAddresses?: { phone?: string | null; isDefault?: boolean }[];
        stripePlatformConfigured?: boolean;
        stripeEmbedOnboardingAvailable?: boolean;
        readiness?: LiveReadiness;
      };
      const s = j.seller ?? null;
      setSeller(s);
      setReadiness(j.readiness ?? null);
      setStripePlatformConfigured(j.stripePlatformConfigured === true);
      setStripeEmbedOnboardingAvailable(j.stripeEmbedOnboardingAvailable === true);
      if (s) {
        setShipName(s.shipFromName ?? "");
        setShipStreet(s.shipFromStreet ?? "");
        setShipCity(s.shipFromCity ?? "");
        setShipState(s.shipFromState ?? "");
        setShipZip(s.shipFromZip ?? "");
        setShipPhone(s.shipFromPhone ?? j.shipFromAddresses?.find((a) => a.isDefault)?.phone ?? j.shipFromAddresses?.[0]?.phone ?? "");
        setDisplayName(s.name ?? "");
        setProfileImage(s.image);
        setShippingSaved(Boolean(j.readiness?.checks.hasShipFromAddress));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    if (loading || !readiness?.checks || stepInitializedRef.current) return;
    stepInitializedRef.current = true;
    const wizardComplete = readSellerWizardComplete();
    const resolved = resolveSellerWizardStep({
      checks: readiness.checks,
      wizardComplete,
    });
    setStep(resolved);
    setStepReady(true);
  }, [loading, readiness]);

  useEffect(() => {
    if (!stripeEmbedOpen) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/account/seller/stripe-status", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const j = (await res.json()) as {
          stripeOnboardingComplete?: boolean;
          stripeChargesEnabled?: boolean | null;
        };
        if (j.stripeOnboardingComplete || j.stripeChargesEnabled === true) {
          setStripeEmbedOpen(false);
          await load();
          toast("Payouts connected.");
        }
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => void poll(), 5000);
    return () => clearInterval(id);
  }, [stripeEmbedOpen, load, toast]);

  const connectPayoutsExternal = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/seller/stripe/onboard", { method: "POST", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        setLoadError(j.error ?? "Could not start payout setup.");
        return;
      }
      if (j.url) window.location.assign(j.url);
    } finally {
      setBusy(false);
    }
  }, []);

  const pollStripePayoutStatus = useCallback(async (): Promise<boolean> => {
    payoutReconcileAbortRef.current = false;
    setPayoutReconciling(true);
    setPayoutReconcileError(null);
    const deadline = Date.now() + 45_000;
    try {
      while (Date.now() < deadline) {
        if (payoutReconcileAbortRef.current) return false;
        const res = await fetch("/api/account/seller/stripe-status", { cache: "no-store", credentials: "same-origin" });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          stripeOnboardingComplete?: boolean;
          stripeChargesEnabled?: boolean | null;
        };
        if (!res.ok) {
          setPayoutReconcileError(j.error ?? "Could not refresh payout status after Stripe.");
          return false;
        }
        await load();
        if (j.stripeOnboardingComplete || j.stripeChargesEnabled === true) {
          toast("Payout setup updated.");
          return true;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setPayoutReconcileError(
        "We could not confirm payout setup yet. Tap Retry to check again, or Back to return to the previous step.",
      );
      return false;
    } finally {
      setPayoutReconciling(false);
      router.replace("/account/seller/setup", { scroll: false });
    }
  }, [load, router, toast]);

  const syncStripeAfterReturn = useCallback(async () => {
    setLoadError(null);
    const ok = await pollStripePayoutStatus();
    if (!ok) {
      console.warn("[seller-setup] stripe return reconcile incomplete");
    }
  }, [pollStripePayoutStatus]);

  useEffect(() => {
    const isReturn = searchParams.get("stripe_return") === "1";
    const isRefresh = searchParams.get("stripe_refresh") === "1";
    if (!isReturn && !isRefresh) return;
    if (status !== "authenticated" || stripeReturnHandledRef.current) return;
    stripeReturnHandledRef.current = true;
    if (isRefresh) {
      toast("Stripe link expired — opening a new session…");
      void connectPayoutsExternal();
      return;
    }
    void syncStripeAfterReturn();
  }, [searchParams, status, connectPayoutsExternal, syncStripeAfterReturn, toast]);

  const openPayoutConnect = () => {
    setPayoutReconcileError(null);
    if (isPayoutSetupComplete(readiness?.checks)) {
      void connectPayoutsExternal();
      return;
    }
    if (stripeEmbedOnboardingAvailable) {
      setStripeEmbedOpen(true);
    } else {
      void connectPayoutsExternal();
    }
  };

  const saveShipFrom = async () => {
    setSaveError(null);
    const phoneOnly = sellerNeedsShipFromPhoneOnly({
      shipFromStreet: shipStreet,
      shipFromCity: shipCity,
      shipFromState: shipState,
      shipFromZip: shipZip,
      shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
      shipFromPhone: shipPhone,
    });
    if (phoneOnly) {
      if (!shipPhone.trim()) {
        setSaveError("Enter a contact phone for USPS labels.");
        return;
      }
    } else {
      const required = [shipStreet, shipCity, shipState, shipZip, shipPhone].map((v) => v.trim());
      if (required.some((v) => !v)) {
        setSaveError("Please complete your address and contact phone.");
        return;
      }
    }
    setSaveBusy(true);
    try {
      const body: Record<string, string> = {
        shipFromPhone: shipPhone,
        shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
      };
      if (!phoneOnly) {
        body.shipFromName = shipName;
        body.shipFromStreet = shipStreet;
        body.shipFromCity = shipCity;
        body.shipFromState = shipState;
        body.shipFromZip = shipZip;
      }
      const res = await fetch("/api/account/seller", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; messages?: string[]; readiness?: LiveReadiness };
      if (!res.ok) {
        const primary = j.error ?? "Could not save your address.";
        const extra = Array.isArray(j.messages)
          ? j.messages.filter((m) => m.trim() && m.trim() !== primary)
          : [];
        setSaveError(extra.length ? `${primary}\n${extra.join("\n")}` : primary);
        return;
      }
      if (j.readiness) setReadiness(j.readiness);
      setShippingSaved(true);
      toast("Shipping address saved.");
      await load();
      setStep(4);
    } finally {
      setSaveBusy(false);
    }
  };

  const finishWizard = async () => {
    if (!sellerAgreementAccepted) {
      toast("Accept the seller agreement to continue.");
      return;
    }
    let checks = readiness?.checks ?? null;
    if (!isRequiredSellerSetupComplete(checks)) {
      try {
        await fetch("/api/account/seller/stripe-status", { cache: "no-store", credentials: "same-origin" });
        const res = await fetch("/api/account/seller", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { readiness?: LiveReadiness };
          if (j.readiness) {
            setReadiness(j.readiness);
            checks = j.readiness.checks;
          }
        }
      } catch {
        /* fall through to validation */
      }
    }
    if (!isRequiredSellerSetupComplete(checks)) {
      toast("Finish payout and shipping setup before completing seller onboarding.");
      setStep(
        resolveSellerWizardStep({
          checks,
          wizardComplete: false,
        }),
      );
      return;
    }
    const result = await persistSellerWizardComplete(true);
    if (!result.ok) {
      toast(result.error);
      return;
    }
    setStep(5);
  };

  const saveProfile = async () => {
    setProfileSaveError(null);
    setProfileSaveBusy(true);
    try {
      const body: { name?: string; image?: string } = {};
      if (displayName.trim()) body.name = displayName.trim();
      if (profileImage) body.image = profileImage;
      if (Object.keys(body).length) {
        const res = await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setProfileSaveError(j.error ?? "Could not save profile.");
          return;
        }
      }
      await finishWizard();
    } finally {
      setProfileSaveBusy(false);
    }
  };

  const skipProfile = () => {
    void finishWizard();
  };

  const goToStep = (next: SellerWizardStep) => setStep(next);

  const goBack = useCallback(() => {
    if (step === 2) {
      if (stripeEmbedOpen) {
        setStripeEmbedOpen(false);
        return;
      }
      goToStep(1);
      return;
    }
    if (step === 3) {
      setShippingSaved(false);
      goToStep(2);
      return;
    }
    if (step === 4) {
      setShippingSaved(false);
      goToStep(3);
      return;
    }
    if (step === 5) {
      clearSellerWizardComplete();
      goToStep(4);
    }
  }, [step, stripeEmbedOpen]);

  if (status === "unauthenticated") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-zinc-400">
          <Link
            href="/signin?returnTo=%2Faccount%2Fseller%2Fsetup"
            className="font-semibold text-gold-bright hover:underline"
          >
            Sign in
          </Link>{" "}
          to start seller setup.
        </div>
      </main>
    );
  }

  if (status === "loading" || loading || !seller || !readiness || !stepReady) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  const checks = readiness.checks;
  const payoutsDone = isPayoutSetupSubmitted(checks);
  const payoutPhase = payoutsDone
    ? "connected"
    : payoutReconciling
      ? "confirming"
      : stripeEmbedOpen || busy
        ? "connecting"
        : payoutReconcileError
          ? "error"
          : "not_connected";

  return (
    <WizardShell step={step}>
      {step === 1 ? (
        <WelcomeStep
          starting={startBusy}
          onStart={() => {
            setStartBusy(true);
            goToStep(2);
            setStartBusy(false);
          }}
        />
      ) : null}

      {step === 2 ? (
        <PayoutStep
          phase={payoutPhase}
          stripePlatformConfigured={stripePlatformConfigured}
          busy={busy}
          embedOpen={stripeEmbedOpen}
          loadError={loadError}
          reconcileError={payoutReconcileError}
          onBack={goBack}
          onConnect={openPayoutConnect}
          onContinue={() => goToStep(3)}
          onRetry={() => void pollStripePayoutStatus()}
          onCancelConfirm={() => {
            payoutReconcileAbortRef.current = true;
            setPayoutReconciling(false);
            setPayoutReconcileError("Payout confirmation cancelled. Tap Connect payouts to try again.");
          }}
          onEmbedClose={() => {
            setStripeEmbedOpen(false);
            void load();
          }}
          onEmbedSessionEnd={() => {
            setStripeEmbedOpen(false);
            void pollStripePayoutStatus();
          }}
          onEmbedFallback={() => {
            setStripeEmbedOpen(false);
            void connectPayoutsExternal();
          }}
        />
      ) : null}

      {step === 3 ? (
        <ShippingStep
          shipName={shipName}
          shipStreet={shipStreet}
          shipCity={shipCity}
          shipState={shipState}
          shipZip={shipZip}
          shipPhone={shipPhone}
          phoneOnlyCompletion={sellerNeedsShipFromPhoneOnly({
            shipFromStreet: shipStreet,
            shipFromCity: shipCity,
            shipFromState: shipState,
            shipFromZip: shipZip,
            shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
            shipFromPhone: shipPhone,
          })}
          saveBusy={saveBusy}
          saveError={saveError}
          saved={shippingSaved}
          onBack={goBack}
          onChange={(field, value) => {
            if (field === "name") setShipName(value);
            if (field === "street") setShipStreet(value);
            if (field === "city") setShipCity(value);
            if (field === "state") setShipState(value);
            if (field === "zip") setShipZip(value);
            if (field === "phone") setShipPhone(value);
          }}
          onSave={() => void saveShipFrom()}
          onContinue={() => goToStep(4)}
        />
      ) : null}

      {step === 4 ? (
        <ProfileStep
          displayName={displayName}
          imageUrl={profileImage}
          saveBusy={profileSaveBusy}
          saveError={profileSaveError}
          sellerAgreementAccepted={sellerAgreementAccepted}
          onSellerAgreementChange={setSellerAgreementAccepted}
          onBack={goBack}
          onDisplayNameChange={setDisplayName}
          onImageChange={setProfileImage}
          onSave={() => void saveProfile()}
          onSkip={skipProfile}
        />
      ) : null}

      {step === 5 ? (
        <CompletionStep
          onBack={goBack}
          onEnterHq={() => {
            if (!isRequiredSellerSetupComplete(checks) || !readSellerWizardComplete()) {
              goToStep(
                resolveSellerWizardStep({
                  checks,
                  wizardComplete: readSellerWizardComplete(),
                }),
              );
              return;
            }
            router.push(SELLER_HQ_PATH);
          }}
        />
      ) : null}
    </WizardShell>
  );
}
