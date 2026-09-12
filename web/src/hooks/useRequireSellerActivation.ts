"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";
import { SELLER_SETUP_PATH } from "@/lib/seller-setup-state";

/** Redirects incomplete sellers to setup before seller-only surfaces (listings, sales, live). */
export function useRequireSellerActivation() {
  const router = useRouter();
  const { status } = useSession();
  const { phase, activated, resolved } = useSellerSetupState(status === "authenticated");

  useEffect(() => {
    if (status !== "authenticated" || phase === "loading" || !resolved) return;
    if (!activated) {
      router.replace(SELLER_SETUP_PATH);
    }
  }, [status, phase, activated, resolved, router]);

  return {
    ready: status === "authenticated" && activated,
    loading:
      status === "loading" ||
      (status === "authenticated" && (phase === "loading" || !resolved)),
  };
}
