"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { AskSellerModal } from "@/components/marketplace/AskSellerModal";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { ListingReportLink, UserReportLink } from "@/components/trust/TrustReportLinks";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import type { ItemTrustMetrics } from "@/lib/marketplace-item-trust";
import { sellerProfilePath } from "@/lib/seller-profile-url";

type MarketplaceItemSellerSectionProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  trustMetrics: ItemTrustMetrics;
};

export function MarketplaceItemSellerSection({ listing, extras, trustMetrics }: MarketplaceItemSellerSectionProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwnListing = Boolean(session?.user?.id && listing.sellerId && session.user.id === listing.sellerId);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const openAskSeller = () => {
    if (!session?.user?.id) {
      const ret = pathname || listing.href || `/marketplace/${encodeURIComponent(listing.id)}`;
      router.push(`/signin?returnTo=${encodeURIComponent(ret)}`);
      return;
    }
    setAskOpen(true);
  };

  const handleAskSubmit = async (text: string) => {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, body: text }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; threadId?: string };
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Message could not be sent.");
    }
    if (typeof data.threadId !== "string") {
      throw new Error("Unexpected response.");
    }
    window.dispatchEvent(new Event("gv-messages-updated"));
    router.push(`/account/messages/${encodeURIComponent(data.threadId)}`);
  };

  const initials = listing.sellerUsername.slice(0, 2).toUpperCase();
  const location = extras.shipsFromDisplay ?? "United States";

  return (
    <section
      className="rounded-2xl border border-white/[0.1] bg-[#09090b]/90 p-5 sm:p-6"
      aria-labelledby="item-seller-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <p id="item-seller-heading" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
          Seller spotlight
        </p>
        {!isOwnListing ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
              aria-label="More actions"
              aria-expanded={menuOpen}
            >
              ···
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-xl border border-white/10 bg-[#121216] py-1 shadow-lg">
                {listing.sellerId ? (
                  <UserReportLink
                    userId={listing.sellerId}
                    label="Report seller"
                    className="block px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.04]"
                  />
                ) : null}
                <ListingReportLink
                  listingId={listing.id}
                  className="block px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.04]"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-sm font-bold text-gold-bright"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={sellerProfilePath(listing.sellerUsername)}
              className="text-lg font-semibold text-zinc-50 transition hover:text-gold-bright/90"
            >
              @{listing.sellerUsername}
            </Link>
            {listing.sellerLevelLabel ? (
              <span className="inline-flex items-center rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-bright/90">
                {listing.sellerLevelLabel}
              </span>
            ) : null}
            {listing.sellerVerified ? (
              <span className="inline-flex items-center rounded-md border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">
                Verified
              </span>
            ) : null}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400 sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Sales</dt>
              <dd className="font-semibold text-zinc-200">{trustMetrics.completedSales}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Standing</dt>
              <dd className="font-semibold text-zinc-200">{trustMetrics.accountStanding}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Location</dt>
              <dd className="font-semibold text-zinc-200">{location}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Response</dt>
              <dd className="font-semibold text-zinc-200">{trustMetrics.responseTime}</dd>
            </div>
          </dl>
        </div>
      </div>

      {!isOwnListing ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {listing.sellerId ? (
            <SellerFollowButton sellerUserId={listing.sellerId} variant="inline" showFollowerCount className="flex-1 sm:flex-none" />
          ) : null}
          <Link
            href={sellerProfilePath(listing.sellerUsername)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06] sm:flex-none"
          >
            View profile
          </Link>
          <button
            type="button"
            onClick={() => openAskSeller()}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 px-4 text-xs font-semibold text-gold-bright transition hover:border-gold/45 hover:bg-gold/15 sm:flex-none"
          >
            Message seller
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">This is your listing.</p>
      )}

      <AskSellerModal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        listingTitle={listing.title}
        sellerUsername={listing.sellerUsername}
        onSubmit={handleAskSubmit}
      />
    </section>
  );
}
