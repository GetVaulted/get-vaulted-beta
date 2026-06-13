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
import { sellerProfilePath } from "@/lib/seller-profile-url";

type MarketplaceItemSellerSectionProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  embedded?: boolean;
};

export function MarketplaceItemSellerSection({ listing, extras, embedded = false }: MarketplaceItemSellerSectionProps) {
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
      className={embedded ? "border-t border-white/[0.08] pt-6" : "rounded-2xl border border-white/[0.1] bg-[#09090b]/90 p-5 sm:p-6"}
      aria-labelledby="item-seller-heading"
    >
      <div className="flex items-start justify-between gap-3">
        {!embedded ? (
          <p id="item-seller-heading" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Seller spotlight
          </p>
        ) : (
          <span id="item-seller-heading" className="sr-only">
            Seller spotlight
          </span>
        )}
        {!isOwnListing ? (
          <div className="relative ml-auto" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
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

      <div className="mt-3 flex items-center gap-4">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gradient-to-br from-gold/20 to-gold/5 text-sm font-bold text-gold-bright"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={sellerProfilePath(listing.sellerUsername)}
              className="text-base font-semibold text-zinc-50 transition hover:text-gold-bright/90"
            >
              @{listing.sellerUsername}
            </Link>
            {listing.sellerLevelLabel ? (
              <span className="inline-flex items-center rounded border border-gold/35 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-bright">
                {listing.sellerLevelLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-zinc-400">{location}</p>
        </div>
      </div>

      {!isOwnListing ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {listing.sellerId ? (
            <SellerFollowButton
              sellerUserId={listing.sellerId}
              variant="inline"
              showFollowerCount={false}
              className="!h-10 !w-full !min-w-0 !flex-1 !justify-center !rounded-lg !border-white/[0.12] !bg-transparent !text-xs !font-semibold !text-zinc-200 hover:!border-white/20 hover:!bg-white/[0.04]"
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => openAskSeller()}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.12] bg-transparent text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            Message
          </button>
          <Link
            href={sellerProfilePath(listing.sellerUsername)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.12] bg-transparent text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            View profile
          </Link>
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
