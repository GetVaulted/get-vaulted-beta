"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

function emitWatchlistToast(message: string) {
  window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
}

function WatchlistIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? "text-gold-bright" : "text-zinc-500"}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4h12a2 2 0 012 2v15l-8-3.5L4 21V6a2 2 0 012-2z"
      />
    </svg>
  );
}

type MarketplaceWatchlistToggleProps = {
  listingId: string;
  sellerId?: string;
  /** "panel" = icon-only; "sticky" = sticky bar; "title" = labeled control beside listing title; "row" = full-width purchase row */
  variant?: "panel" | "sticky" | "title" | "row";
};

export function MarketplaceWatchlistToggle({ listingId, sellerId, variant = "panel" }: MarketplaceWatchlistToggleProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSaved = useCallback(async () => {
    if (!session?.user?.id) {
      setSaved(false);
      return;
    }
    const res = await fetch(`/api/watchlist/check?listingId=${encodeURIComponent(listingId)}`);
    if (!res.ok) {
      setSaved(false);
      return;
    }
    const data = (await res.json()) as { saved?: boolean };
    setSaved(Boolean(data.saved));
  }, [listingId, session?.user?.id]);

  useEffect(() => {
    if (status === "loading") return;
    void loadSaved();
  }, [loadSaved, status]);

  useEffect(() => {
    const on = (ev: Event) => {
      const ce = ev as CustomEvent<{ listingId?: string }>;
      if (ce.detail?.listingId && ce.detail.listingId !== listingId) return;
      void loadSaved();
    };
    window.addEventListener("gv-watchlist-updated", on as EventListener);
    return () => window.removeEventListener("gv-watchlist-updated", on as EventListener);
  }, [listingId, loadSaved]);

  const isOwnListing = Boolean(session?.user?.id && sellerId && session.user.id === sellerId);
  if (isOwnListing) return null;

  const onClick = async () => {
    if (!session?.user?.id) {
      const ret = pathname || `/marketplace/${encodeURIComponent(listingId)}`;
      router.push(`/signin?returnTo=${encodeURIComponent(ret)}`);
      return;
    }
    if (saved === null || busy) return;
    setBusy(true);
    try {
      if (saved) {
        const res = await fetch(`/api/watchlist/${encodeURIComponent(listingId)}`, { method: "DELETE" });
        if (!res.ok) {
          emitWatchlistToast("Could not remove from watchlist.");
          return;
        }
        setSaved(false);
        emitWatchlistToast("Removed from watchlist");
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          emitWatchlistToast(typeof data.error === "string" ? data.error : "Could not save.");
          return;
        }
        setSaved(true);
        emitWatchlistToast("Added to watchlist");
      }
      window.dispatchEvent(new CustomEvent("gv-watchlist-updated", { detail: { listingId } }));
    } finally {
      setBusy(false);
    }
  };

  const filled = saved === true;
  const btnClass =
    variant === "sticky"
      ? "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-400 transition hover:border-gold/35 hover:bg-white/[0.07] hover:text-gold-bright disabled:opacity-50 sm:size-12"
      : variant === "title"
        ? "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-semibold text-zinc-300 transition hover:border-gold/30 hover:bg-white/[0.07] hover:text-zinc-100 disabled:opacity-50"
        : variant === "row"
          ? "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] text-sm font-medium text-zinc-200 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-zinc-50 active:scale-[0.99] disabled:opacity-50"
          : "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-transparent text-zinc-500 transition hover:border-white/12 hover:bg-white/[0.03] hover:text-zinc-400 disabled:opacity-50 active:scale-[0.96]";

  const label = filled ? "Watching" : "Watch";

  return (
    <button
      type="button"
      className={btnClass}
      aria-label={filled ? "Remove from watchlist" : "Save to watchlist"}
      aria-pressed={filled}
      disabled={busy || saved === null}
      onClick={() => void onClick()}
    >
      <span
        className={
          variant === "sticky"
            ? "size-[18px]"
            : variant === "title"
              ? "size-4"
              : variant === "row"
                ? "size-[17px]"
                : "size-[17px]"
        }
      >
        <WatchlistIcon filled={filled} />
      </span>
      {variant === "title" || variant === "row" ? <span>{label}</span> : null}
    </button>
  );
}
