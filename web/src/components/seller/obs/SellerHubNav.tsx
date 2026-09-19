"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SELLER_OBS_PATH } from "@/lib/obs-seller-paths";
import { SELLER_HQ_PATH } from "@/lib/seller-setup-state";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 15,
  height: 15,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  overview: (
    <svg {...ICON_PROPS}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </svg>
  ),
  live: (
    <svg {...ICON_PROPS} strokeLinejoin={undefined}>
      <circle cx="12" cy="12" r="3" />
      <path d="M7.5 8.2a6.5 6.5 0 0 0 0 7.6" />
      <path d="M16.5 8.2a6.5 6.5 0 0 1 0 7.6" />
      <path d="M4.6 5.3a10.5 10.5 0 0 0 0 13.4" />
      <path d="M19.4 5.3a10.5 10.5 0 0 1 0 13.4" />
    </svg>
  ),
  listings: (
    <svg {...ICON_PROPS}>
      <path d="M11 3H4v7l10 10 7-7L11 3Z" />
      <circle cx="7.7" cy="7.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  sales: (
    <svg {...ICON_PROPS}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  financials: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="6" width="18" height="12" rx="2.2" />
      <path d="M3 10.2h18" />
    </svg>
  ),
  shipping: (
    <svg {...ICON_PROPS}>
      <path d="M3 8 12 4l9 4-9 4-9-4Z" />
      <path d="M3 8v9l9 4 9-4V8" />
      <path d="M12 12v9" />
    </svg>
  ),
  offers: (
    <svg {...ICON_PROPS} strokeLinejoin={undefined}>
      <path d="M6.5 6.5 17.5 17.5" />
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="16" r="2" />
    </svg>
  ),
  messages: (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H8l-4 3.2V5Z" />
    </svg>
  ),
  obs: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.2 21 7v10l-6-3.2Z" />
    </svg>
  ),
};

type SellerNavBadgeKey = "messages" | null;

const NAV: {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badgeKey: SellerNavBadgeKey;
}[] = [
  { href: SELLER_HQ_PATH, label: "Overview", icon: "overview", badgeKey: null },
  { href: "/seller/live", label: "Live", icon: "live", badgeKey: null },
  { href: "/seller/listings", label: "Listings", icon: "listings", badgeKey: null },
  { href: "/account/sales", label: "Sales", icon: "sales", badgeKey: null },
  { href: "/account/seller/financials", label: "Financials", icon: "financials", badgeKey: null },
  { href: "/account/seller/shipping", label: "Shipping", icon: "shipping", badgeKey: null },
  { href: "/account/offers", label: "Offers", icon: "offers", badgeKey: null },
  { href: "/account/messages", label: "Messages", icon: "messages", badgeKey: "messages" },
  { href: SELLER_OBS_PATH, label: "OBS", icon: "obs", badgeKey: null },
];

/**
 * Single seller navigation strip for the Seller HQ hub and its sub-pages.
 * Replaces the old pairing of this nav with the generic AccountOrdersNav
 * on the hub page, which produced two redundant tab bars.
 */
export function SellerHubNav({
  activeHref,
  unreadMessagesCount = 0,
}: {
  activeHref: string;
  unreadMessagesCount?: number;
}) {
  return (
    <nav
      className="mt-6 -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Seller navigation"
    >
      {NAV.map((item) => {
        const active = item.href === activeHref;
        const badge = item.badgeKey === "messages" && unreadMessagesCount > 0 ? unreadMessagesCount : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              active
                ? "bg-gold/15 text-gold-bright ring-1 ring-gold/30"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            <span className={active ? "text-gold-bright" : "text-zinc-600"}>{ICONS[item.icon]}</span>
            {item.label}
            {badge ? (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-zinc-950">
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
