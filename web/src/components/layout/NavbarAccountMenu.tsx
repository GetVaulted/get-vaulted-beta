"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveMarketplaceEnabled } from "@/components/providers/LiveMarketplaceGateProvider";

export type NavMenuItem = { href: string; label: string };

const signedInLinks: NavMenuItem[] = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/account/listings", label: "My Listings" },
  { href: "/account/seller", label: "Seller" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/sales", label: "Sales" },
  { href: "/account/offers", label: "Offers" },
  { href: "/account/messages", label: "Messages" },
  { href: "/account/following", label: "Following" },
  { href: "/account/watchlist", label: "Watchlist" },
  { href: "/live", label: "Live Rooms" },
  { href: "/seller/live", label: "Go Live" },
];

type NavbarAccountMenuProps = {
  isAdmin: boolean;
  className?: string;
  /** Called after navigating (e.g. close mobile drawer). */
  onNavigate?: () => void;
  /** When set, render as a vertical list (mobile) instead of dropdown. */
  variant?: "dropdown" | "list";
};

export function NavbarAccountMenu({ isAdmin, className = "", onNavigate, variant = "dropdown" }: NavbarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveMarketplaceEnabled = useLiveMarketplaceEnabled();

  const links: NavMenuItem[] = useMemo(() => {
    const base: NavMenuItem[] = isAdmin
      ? [...signedInLinks, { href: "/admin", label: "Admin" }]
      : [...signedInLinks];
    if (liveMarketplaceEnabled) return base;
    return base.map((item) => {
      if (item.href === "/live" || item.href === "/seller/live") {
        return { ...item, href: "/coming-soon" };
      }
      return item;
    });
  }, [isAdmin, liveMarketplaceEnabled]);

  useEffect(() => {
    if (!open || variant !== "dropdown") return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, variant]);

  const itemClass =
    "block rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-elevated hover:text-gold-bright/95";

  if (variant === "list") {
    return (
      <div className={className}>
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-muted">Your account</p>
        <nav className="flex flex-col gap-0.5" aria-label="Account navigation">
          {links.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} className={itemClass} onClick={() => onNavigate?.()}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-gold/35 hover:bg-surface-elevated"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Menu
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-[70] mt-2 max-h-[min(70vh,28rem)] w-56 overflow-y-auto rounded-xl border border-border-subtle bg-background py-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.85)]"
          role="menu"
        >
          <nav className="flex flex-col px-1" aria-label="Account navigation">
            {links.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
