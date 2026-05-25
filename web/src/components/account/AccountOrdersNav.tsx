import Link from "next/link";

const links = [
  { href: "/account/orders", label: "Orders", key: "orders" as const },
  { href: "/account/payment-methods", label: "Wallet", key: "payments" as const },
  { href: "/account/sales", label: "Sales", key: "sales" as const },
  { href: "/account/seller", label: "Seller HQ", key: "seller" as const },
  { href: "/account/offers", label: "Offers", key: "offers" as const },
  { href: "/account/messages", label: "Messages", key: "messages" as const },
  { href: "/account/notifications", label: "Notifications", key: "notifications" as const },
  { href: "/account/watchlist", label: "Watchlist", key: "watchlist" as const },
  { href: "/account/listings", label: "Listings", key: "listings" as const },
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
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-white/[0.07] pb-3" aria-label="Account">
      {links.map(({ href, label, key }) => {
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
