"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRequiredSellerSetupComplete,
  isSellerActivated,
  resolveSellerLifecycleState,
  resolveSellerSetupPhase,
  type SellerLifecycleState,
  type SellerReadinessChecks,
  type SellerSetupPhase,
} from "@/lib/seller-setup-state";
import {
  markSellerWizardComplete,
  readSellerWizardComplete,
  SELLER_WIZARD_COMPLETE_KEY,
  SELLER_WIZARD_COMPLETE_EVENT,
} from "@/lib/seller-setup-wizard";

const DEFAULT_CHECKS: SellerReadinessChecks = {
  hasStripeAccount: false,
  stripeChargesEnabled: false,
  hasShipFromAddress: false,
};

export type NavSellerStatus = "idle" | "loading" | "onboarded" | "not_onboarded";

/** Seller onboarding phase for nav gating and setup vs HQ routing. */
export function useSellerSetupState(enabled: boolean) {
  const [phase, setPhase] = useState<SellerSetupPhase>(enabled ? "loading" : "not_started");
  const [lifecycle, setLifecycle] = useState<SellerLifecycleState>("NOT_STARTED");
  const [checks, setChecks] = useState<SellerReadinessChecks | null>(null);
  const [wizardComplete, setWizardComplete] = useState(false);
  const [canGoLive, setCanGoLive] = useState(false);
  /** False until a successful /api/account/seller response — avoids redirecting on transient failures. */
  const [resolved, setResolved] = useState(false);
  const checksRef = useRef<SellerReadinessChecks | null>(null);
  const wizardRef = useRef(false);
  const canGoLiveRef = useRef(false);

  const syncWizardComplete = useCallback(() => {
    setWizardComplete(readSellerWizardComplete());
  }, []);

  const applyPhase = useCallback(
    (nextChecks: SellerReadinessChecks, wizardDone: boolean, liveReady: boolean) => {
      checksRef.current = nextChecks;
      wizardRef.current = wizardDone;
      canGoLiveRef.current = liveReady;
      setChecks(nextChecks);
      setCanGoLive(liveReady);
      setPhase(resolveSellerSetupPhase(nextChecks, false, wizardDone));
      setLifecycle(
        resolveSellerLifecycleState({
          checks: nextChecks,
          wizardComplete: wizardDone,
          canGoLive: liveReady,
          loading: false,
        }),
      );
      setResolved(true);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!enabled) {
      setPhase("not_started");
      setLifecycle("NOT_STARTED");
      setChecks(null);
      checksRef.current = null;
      setWizardComplete(false);
      setCanGoLive(false);
      setResolved(false);
      return;
    }
    setPhase("loading");
    setResolved(false);
    const localWizard = readSellerWizardComplete();
    try {
      let res = await fetch("/api/account/seller", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        // Keep last known good state so a 503/timeout does not kick activated sellers into setup.
        if (checksRef.current) {
          applyPhase(checksRef.current, wizardRef.current || localWizard, canGoLiveRef.current);
        } else {
          setPhase("loading");
          setResolved(false);
        }
        return;
      }
      let payload = (await res.json()) as {
        setupWizardComplete?: boolean;
        readiness?: { checks?: SellerReadinessChecks; canGoLive?: boolean };
      };
      let nextChecks = payload.readiness?.checks ?? DEFAULT_CHECKS;
      if (nextChecks.hasStripeAccount && !nextChecks.stripeChargesEnabled) {
        try {
          await fetch("/api/account/seller/stripe-status", { credentials: "same-origin", cache: "no-store" });
          res = await fetch("/api/account/seller", { credentials: "same-origin", cache: "no-store" });
          if (res.ok) {
            payload = (await res.json()) as typeof payload;
            nextChecks = payload.readiness?.checks ?? nextChecks;
          }
        } catch {
          /* keep first payload */
        }
      }
      const serverWizard = payload.setupWizardComplete === true;
      if (serverWizard && !localWizard) markSellerWizardComplete();
      const wizardDone = serverWizard || localWizard;
      setWizardComplete(wizardDone);
      applyPhase(nextChecks, wizardDone, Boolean(payload.readiness?.canGoLive));
    } catch {
      if (checksRef.current) {
        applyPhase(checksRef.current, wizardRef.current || localWizard, canGoLiveRef.current);
      } else {
        setPhase("loading");
        setResolved(false);
      }
    }
  }, [enabled, applyPhase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    syncWizardComplete();
    const onComplete = () => syncWizardComplete();
    window.addEventListener(SELLER_WIZARD_COMPLETE_EVENT, onComplete);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELLER_WIZARD_COMPLETE_KEY) onComplete();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SELLER_WIZARD_COMPLETE_EVENT, onComplete);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, syncWizardComplete]);

  useEffect(() => {
    if (!checks) return;
    setPhase(resolveSellerSetupPhase(checks, false, wizardComplete));
    setLifecycle(
      resolveSellerLifecycleState({
        checks,
        wizardComplete,
        canGoLive,
        loading: false,
      }),
    );
  }, [checks, wizardComplete, canGoLive]);

  return {
    phase,
    lifecycle,
    checks,
    wizardComplete,
    canGoLive,
    requiredComplete: isRequiredSellerSetupComplete(checks),
    activated: isSellerActivated(checks, wizardComplete),
    /** True only after a successful seller payload load (or restored prior success). */
    resolved,
    refetch: load,
  };
}

/** @deprecated Prefer useSellerSetupState().phase for menu labels. */
export function useNavSellerStatus(enabled: boolean): NavSellerStatus {
  const { phase } = useSellerSetupState(enabled);
  if (!enabled) return "idle";
  if (phase === "loading") return "loading";
  return phase === "ready" ? "onboarded" : "not_onboarded";
}
