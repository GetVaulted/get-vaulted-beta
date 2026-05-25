"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useNavSellerStatus } from "@/hooks/useNavSellerStatus";

const DISMISS_KEY = "gv-home-seller-banner-dismissed";

export function HomeFirstLoginSellerBanner() {
  const { status } = useSession();
  const sellerStatus = useNavSellerStatus(status === "authenticated");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (status !== "authenticated" || sellerStatus !== "not_onboarded" || dismissed) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <section
      className="border-b border-gold/20 bg-[linear-gradient(90deg,rgba(201,162,39,0.12)_0%,rgba(9,9,12,0.95)_55%)]"
      aria-label="Seller onboarding"
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:px-10">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright">New here?</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">Turn your collection into a storefront on Get Vaulted.</p>
          <p className="mt-1 text-xs text-zinc-400">
            List cards, run live breaks, and get paid — setup takes a few minutes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/account/seller"
            className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110"
          >
            Start Seller Setup
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
          >
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
