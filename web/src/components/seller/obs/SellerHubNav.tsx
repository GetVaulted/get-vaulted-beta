"use client";

import Link from "next/link";
import { SELLER_OBS_PATH } from "@/lib/obs-seller-paths";

const NAV = [
  { href: "/account/seller", label: "HQ" },
  { href: "/account/seller/shipping", label: "Shipping" },
  { href: "/seller/listings", label: "Listings" },
  { href: "/account/sales", label: "Sales" },
  { href: "/account/messages", label: "Messages" },
  { href: "/seller/live", label: "Live" },
  { href: SELLER_OBS_PATH, label: "OBS" },
] as const;

export function SellerHubNav({ activeHref }: { activeHref: string }) {
  return (
    <nav
      className="mt-6 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Seller navigation"
    >
      {NAV.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              active
                ? "bg-gold/15 text-gold-bright ring-1 ring-gold/30"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
