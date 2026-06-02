"use client";

import Link from "next/link";
import { SELLER_OBS_PATH } from "@/lib/obs-seller-paths";

const NAV = [
  { href: "/account/seller", label: "HQ" },
  { href: "/seller/listings", label: "Listings" },
  { href: "/account/sales", label: "Sales" },
  { href: "/account/messages", label: "Messages" },
  { href: "/seller/live", label: "Live" },
  { href: SELLER_OBS_PATH, label: "OBS Studio" },
] as const;

export function SellerHubNav({ activeHref }: { activeHref: string }) {
  return (
    <nav className="mt-5 flex flex-wrap gap-2 border-b border-white/[0.07] pb-3" aria-label="Seller navigation">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:px-3.5 ${
            item.href === activeHref
              ? "border-gold/45 bg-gold/12 text-gold-bright"
              : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
