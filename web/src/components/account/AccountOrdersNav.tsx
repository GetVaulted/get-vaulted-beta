"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSellerSetupState } from "@/hooks/useSellerSetupState";
import { SELLER_HQ_PATH } from "@/lib/seller-setup-state";

export type AccountNavActive =
  | "orders"
  | "layaways"
  | "payments"
  | "financials"
  | "sales"
  | "seller"
  | "offers"
  | "messages"
  | "notifications"
  | "watchlist"
  | "listings";

export type AccountNavMode = "buyer" | "seller";

const BUYER_LINKS = [
  { href: "/account/orders", label: "Orders", key: "orders" as const },
  { href: "/account/financials", label: "Financials", key: "financials" as const },
  { href: "/account/layaways", label: "Layaways", key: "layaways" as const },
  { href: "/account/payment-methods", label: "Wallet", key: "payments" as const },
  { href: "/account/watchlist", label: "Watchlist", key: "watchlist" as const },
  { href: "/account/messages", label: "Messages", key: "messages" as const },
] as const;

const SELLER_LINKS = [
  { href: "/account/sales", label: "Sales", key: "sales" as const },
  { href: "/account/seller/financials", label: "Financials", key: "financials" as const },
  { href: "/account/listings", label: "Listings", key: "listings" as const },
  { href: SELLER_HQ_PATH, label: "Seller HQ", key: "seller" as const },
  { href: "/account/offers", label: "Offers", key: "offers" as const },
  { href: "/account/messages", label: "Messages", key: "messages" as const },
] as const;

/** Context strip for account pages — buyer tools vs seller tools, not a full sitemap. */
export function AccountOrdersNav({
  active,
  mode,
}: {
  active: AccountNavActive;
  mode: AccountNavMode;
}) {
  const { status } = useSession();
  const { phase } = useSellerSetupState(status === "authenticated");
  const links = mode === "seller" ? SELLER_LINKS : BUYER_LINKS;
  const visibleLinks =
    mode === "seller" && phase !== "ready" && phase !== "loading"
      ? links.filter((link) => link.key === "messages")
      : links;

  return (
    <nav
      className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-white/[0.07] pt-3"
      aria-label={mode === "seller" ? "Seller account" : "Buyer account"}
    >
      <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
        {mode === "seller" ? "Seller" : "Buying"}
      </span>
      {visibleLinks.map(({ href, label, key }) => {
        const sel = key === active;
        return (
          <Link
            key={`${mode}-${href}`}
            href={href}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide transition ${
              sel
                ? "bg-white/[0.08] text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            }`}
          >
            {label}
          </Link>
        );
      })}
      <Link
        href="/account"
        className="ml-auto rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-600 transition hover:text-zinc-300"
      >
        Account home
      </Link>
    </nav>
  );
}
