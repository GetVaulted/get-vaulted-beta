"use client";

import { useEffect } from "react";

/** Applies body class to hide footer and tune global chrome during seller onboarding. */
export function SellerSetupOnboardingChrome() {
  useEffect(() => {
    document.body.classList.add("seller-onboarding");
    return () => document.body.classList.remove("seller-onboarding");
  }, []);
  return null;
}
