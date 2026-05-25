"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";

const links = [
  { href: "/account/orders", label: "Orders", key: "orders" as const, sellerOnly: false },
  { href: "/account/payment-methods", label: "Wallet", key: "payments" as const, sellerOnly: false },
  { href: "/account/sales", label: "Sales", key: "sales" as const, sellerOnly: true },
  { href: "/account/seller", label: "Seller HQ", key: "seller" as const, sellerOnly: true },
  { href: "/account/offers", label: "Offers", key: "offers" as const, sellerOnly: true },
  { href: "/account/messages", label: "Messages", key: "messages" as const, sellerOnly: false },
  { href: "/account/notifications", label: "Notifications", key: "notifications" as const, sellerOnly: false },
  { href: "/account/watchlist", label: "Watchlist", key: "watchlist" as const, sellerOnly: false },
  { href: "/account/listings", label: "Listings", key: "listings" as const, sellerOnly: true },
];

export function AccountOrdersNav({
  active,
}: {
  active:
    | "orders"
    | "payments"
    | "sales"
    | "seller"
    | "offers"
    | "messages"
    | "notifications"
    | "watchlist"
    | "listings";
}) {
  const { status } = useSession();
  const { phase } = useSellerSetupState(status === "authenticated");
  const visibleLinks = links.filter((link) => !link.sellerOnly || phase === "ready");

  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-white/[0.07] pb-3" aria-label="Account">
      {visibleLinks.map(({ href, label, key }) => {
        const sel = key === active;
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
              sel
                ? "border-gold/45 bg-gold/12 text-gold-bright"
                : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
