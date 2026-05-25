"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompletionStep } from "@/components/account/sellerSetup/steps/CompletionStep";
import { PayoutStep } from "@/components/account/sellerSetup/steps/PayoutStep";
import { ProfileStep } from "@/components/account/sellerSetup/steps/ProfileStep";
import { ShippingStep } from "@/components/account/sellerSetup/steps/ShippingStep";
import { WelcomeStep } from "@/components/account/sellerSetup/steps/WelcomeStep";
import { WizardShell } from "@/components/account/sellerSetup/WizardShell";
import { SELLER_SHIP_FROM_COUNTRY } from "@/lib/seller-shipping-readiness";
import {
  isPayoutSetupComplete,
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
  const [stripePlatformConfigured, setStripePlatformConfigured] = useState(false);
  const [stripeEmbedOpen, setStripeEmbedOpen] = useState(false);

  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shippingSaved, setShippingSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [sellerAgreementAccepted, setSellerAgreementAccepted] = useState(false);
  const stepInitializedRef = useRef(false);

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
        seller?: SellerPayload;
        stripePlatformConfigured?: boolean;
        readiness?: LiveReadiness;
      };
      const s = j.seller ?? null;
      setSeller(s);
      setReadiness(j.readiness ?? null);
      setStripePlatformConfigured(j.stripePlatformConfigured === true);
      if (s) {
        setShipName(s.shipFromName ?? "");
        setShipStreet(s.shipFromStreet ?? "");
        setShipCity(s.shipFromCity ?? "");
        setShipState(s.shipFromState ?? "");
        setShipZip(s.shipFromZip ?? "");
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
        const res = await fetch("/api/account/seller/stripe-status", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { stripeOnboardingComplete?: boolean };
        if (j.stripeOnboardingComplete) {
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

  const connectPayoutsExternal = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/seller/stripe/onboard", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        setLoadError(j.error ?? "Could not start payout setup.");
        return;
      }
      if (j.url) window.location.assign(j.url);
    } finally {
      setBusy(false);
    }
  };

  const openPayoutConnect = () => {
    if (isPayoutSetupComplete(readiness?.checks)) {
      void connectPayoutsExternal();
      return;
    }
    setStripeEmbedOpen(true);
  };

  const saveShipFrom = async () => {
    setSaveError(null);
    const required = [shipStreet, shipCity, shipState, shipZip].map((v) => v.trim());
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
          shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; readiness?: LiveReadiness };
      if (!res.ok) {
        setSaveError(j.error ?? "Could not save your address.");
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
    await persistSellerWizardComplete(true);
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
  const payoutsDone = isPayoutSetupComplete(checks);
  const payoutPhase = payoutsDone ? "connected" : stripeEmbedOpen || busy ? "connecting" : "not_connected";

  return (
    <WizardShell step={step}>
      {step === 1 ? <WelcomeStep onStart={() => goToStep(2)} /> : null}

      {step === 2 ? (
        <PayoutStep
          phase={payoutPhase}
          stripePlatformConfigured={stripePlatformConfigured}
          busy={busy}
          embedOpen={stripeEmbedOpen}
          loadError={loadError}
          onBack={goBack}
          onConnect={openPayoutConnect}
          onContinue={() => goToStep(3)}
          onEmbedClose={() => {
            setStripeEmbedOpen(false);
            void load();
          }}
          onEmbedSessionEnd={() => {
            setStripeEmbedOpen(false);
            void load();
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
