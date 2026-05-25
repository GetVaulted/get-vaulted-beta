"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { AskSellerModal } from "@/components/marketplace/AskSellerModal";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { ListingReportLink, UserReportLink } from "@/components/trust/TrustReportLinks";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import { sellerProfilePath } from "@/lib/seller-profile-url";

type MarketplaceItemSellerSectionProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
};

export function MarketplaceItemSellerSection({ listing, extras }: MarketplaceItemSellerSectionProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const isOwnListing = Boolean(session?.user?.id && listing.sellerId && session.user.id === listing.sellerId);

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

  return (
    <section className="mt-5 rounded-2xl border border-white/[0.1] bg-[#09090b]/80 p-4 sm:p-5" aria-labelledby="item-seller-heading">
      <h2 id="item-seller-heading" className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        Seller
      </h2>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <Link
          href={sellerProfilePath(listing.sellerUsername)}
          className="text-base font-semibold text-zinc-100 transition hover:text-gold-bright/90"
        >
          @{listing.sellerUsername}
        </Link>
        {listing.sellerRating != null ? (
          <>
            <span className="tabular-nums text-zinc-400">★ {listing.sellerRating.toFixed(1)}</span>
            <span className="text-zinc-500">·</span>
          </>
        ) : null}
        <span className="text-zinc-400">{extras.sellerCredibilityLabel}</span>
        {listing.sellerVerified ? (
          <span className="inline-flex items-center rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-200">
            Verified
          </span>
        ) : null}
      </div>

      {!isOwnListing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAskSeller()}
            className="inline-flex h-9 min-w-[8.5rem] flex-1 items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:flex-none"
          >
            Ask seller
          </button>
          {listing.sellerId ? (
            <SellerFollowButton sellerUserId={listing.sellerId} variant="inline" showFollowerCount className="flex-1 sm:flex-none" />
          ) : null}
          {listing.sellerId ? (
            <UserReportLink userId={listing.sellerId} label="Report seller" className="inline-flex h-9 items-center px-2" />
          ) : null}
          <ListingReportLink listingId={listing.id} className="inline-flex h-9 items-center px-2" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">This is your listing.</p>
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
