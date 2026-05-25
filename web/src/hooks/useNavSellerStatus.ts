"use client";

import { useEffect, useState } from "react";

export type NavSellerStatus = "idle" | "loading" | "onboarded" | "not_onboarded";

/** Whether the signed-in user has completed seller Stripe onboarding. */
export function useNavSellerStatus(enabled: boolean): NavSellerStatus {
  const [status, setStatus] = useState<NavSellerStatus>(enabled ? "loading" : "idle");

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch("/api/account/seller", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const onboarded = Boolean(payload?.seller?.stripeOnboardingComplete);
        setStatus(onboarded ? "onboarded" : "not_onboarded");
      })
      .catch(() => {
        if (!cancelled) setStatus("not_onboarded");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
