"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveMarketplaceEnabled } from "@/components/providers/LiveMarketplaceGateProvider";
import { useNavSellerStatus } from "@/hooks/useNavSellerStatus";

export type NavMenuUser = {
  username: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
  variant?: "default" | "cta";
};

type MenuSection = {
  id: string;
  title?: string;
  items: MenuItem[];
};

type NavbarAccountMenuProps = {
  user: NavMenuUser;
  isAdmin: boolean;
  className?: string;
  onNavigate?: () => void;
  variant?: "dropdown" | "list";
};

function liveHref(enabled: boolean, path: string): string {
  return enabled ? path : "/coming-soon";
}

function buildSections(
  user: NavMenuUser,
  isAdmin: boolean,
  sellerStatus: ReturnType<typeof useNavSellerStatus>,
  liveEnabled: boolean,
): MenuSection[] {
  const sections: MenuSection[] = [
    {
      id: "activity",
      items: [
        { href: "/account/notifications", label: "Notifications", icon: <BellIcon /> },
        { href: "/account/messages", label: "Messages", icon: <ChatIcon /> },
      ],
    },
    {
      id: "buying",
      title: "Buying",
      items: [
        { href: "/marketplace", label: "Marketplace", icon: <ShopIcon /> },
        { href: "/account/watchlist", label: "Watchlist", icon: <HeartIcon /> },
        { href: "/account/following", label: "Following", icon: <UsersIcon /> },
        { href: "/account/orders", label: "Orders", icon: <PackageIcon /> },
        { href: "/account/payment-methods", label: "Wallet", icon: <WalletIcon /> },
      ],
    },
  ];

  if (sellerStatus === "onboarded") {
    sections.push({
      id: "selling",
      title: "Selling",
      items: [
        { href: "/account/seller", label: "Seller HQ", icon: <StoreIcon /> },
        { href: "/account/listings", label: "My Listings", icon: <TagIcon /> },
        { href: "/account/sales", label: "Sales", icon: <ReceiptIcon /> },
        { href: "/account/offers", label: "Offers", icon: <OfferIcon /> },
      ],
    });
  } else if (sellerStatus === "not_onboarded") {
    sections.push({
      id: "selling-cta",
      title: "Sell on Get Vaulted",
      items: [
        {
          href: "/account/seller",
          label: "Start Seller Setup",
          icon: <SparkIcon />,
          variant: "cta",
        },
      ],
    });
  }

  sections.push({
    id: "live",
    title: "Live",
    items: [
      { href: liveHref(liveEnabled, "/live"), label: "Browse Live Shows", icon: <LiveIcon /> },
      {
        href: liveHref(liveEnabled, "/seller/live"),
        label: "My Live Events",
        icon: <CalendarIcon />,
      },
      {
        href: liveHref(liveEnabled, "/seller/live"),
        label: "Go Live",
        icon: <BroadcastIcon />,
        variant: "cta",
      },
    ],
  });

  const settingsItems: MenuItem[] = [
    { href: "/account/seller", label: "Account Settings", icon: <GearIcon /> },
    {
      href: "mailto:support@shopgetvaulted.com",
      label: "Support",
      icon: <HelpIcon />,
    },
  ];
  if (isAdmin) {
    settingsItems.unshift({ href: "/admin", label: "Admin", icon: <ShieldIcon /> });
  }
  sections.push({ id: "settings", title: "Settings", items: settingsItems });

  return sections;
}

function userInitials(user: NavMenuUser): string {
  const fromName = user.name?.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  if (fromName) return fromName;
  return user.username.slice(0, 2).toUpperCase();
}

function IdentityHeader({
  user,
  onNavigate,
  compact,
}: {
  user: NavMenuUser;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const profileHref = `/seller/${encodeURIComponent(user.username)}`;
  return (
    <div className={`border-b border-white/[0.08] ${compact ? "px-3 pb-3 pt-1" : "px-3 pb-4 pt-2"}`}>
      <div className="flex items-center gap-3">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs
          <img
            src={user.image}
            alt=""
            className="size-11 shrink-0 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <span
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-sm font-bold text-gold-bright"
            aria-hidden
          >
            {userInitials(user)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {user.name ? (
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
          ) : null}
          <p className="truncate text-xs font-medium text-gold-bright/90">@{user.username}</p>
          {user.email ? (
            <p className="mt-0.5 truncate text-[11px] text-muted">{user.email}</p>
          ) : null}
        </div>
      </div>
      <Link
        href={profileHref}
        onClick={() => onNavigate?.()}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 transition hover:text-gold-bright"
      >
        <UserIcon className="size-3.5 shrink-0" />
        View Profile / My Vault
      </Link>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="mb-1.5 mt-4 first:mt-0 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
      {title}
    </p>
  );
}

function MenuLink({
  item,
  onNavigate,
  listVariant,
}: {
  item: MenuItem;
  onNavigate?: () => void;
  listVariant: boolean;
}) {
  const isCta = item.variant === "cta";
  const isExternal = item.href.startsWith("mailto:");
  const className = isCta
    ? listVariant
      ? "mx-1 flex items-center gap-3 rounded-xl bg-gradient-to-r from-gold to-gold-bright px-3 py-3 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110"
      : "mx-1 flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-gold to-gold-bright px-3 py-2.5 text-sm font-bold text-zinc-950 shadow-[0_0_20px_-8px_rgba(201,162,39,0.5)] transition hover:brightness-110"
    : listVariant
      ? "flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-surface-elevated"
      : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-elevated hover:text-gold-bright/95";

  const content = (
    <>
      <span className={`shrink-0 ${isCta ? "text-zinc-950/80" : "text-zinc-500"}`}>{item.icon}</span>
      <span>{item.label}</span>
    </>
  );

  if (isExternal) {
    return (
      <a href={item.href} className={className} onClick={() => onNavigate?.()}>
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={() => onNavigate?.()}>
      {content}
    </Link>
  );
}

function MenuSections({
  sections,
  onNavigate,
  listVariant,
  onSignOut,
}: {
  sections: MenuSection[];
  onNavigate?: () => void;
  listVariant: boolean;
  onSignOut: () => void;
}) {
  return (
    <nav className={listVariant ? "flex flex-col pb-2" : "flex flex-col px-1 pb-1"} aria-label="Account navigation">
      {sections.map((section) => (
        <div key={section.id}>
          {section.title ? <SectionHeader title={section.title} /> : null}
          <div className={listVariant ? "flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
            {section.items.map((item) => (
              <MenuLink
                key={`${section.id}-${item.href}-${item.label}`}
                item={item}
                onNavigate={onNavigate}
                listVariant={listVariant}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 border-t border-white/[0.08] pt-3">
        <button
          type="button"
          onClick={onSignOut}
          className={
            listVariant
              ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-zinc-400 transition-colors hover:bg-surface-elevated hover:text-foreground"
              : "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-surface-elevated hover:text-foreground"
          }
        >
          <SignOutIcon className="size-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </nav>
  );
}

export function NavbarAccountMenu({
  user,
  isAdmin,
  className = "",
  onNavigate,
  variant = "dropdown",
}: NavbarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveMarketplaceEnabled = useLiveMarketplaceEnabled();
  const sellerStatus = useNavSellerStatus(true);

  const sections = useMemo(
    () => buildSections(user, isAdmin, sellerStatus, liveMarketplaceEnabled),
    [user, isAdmin, sellerStatus, liveMarketplaceEnabled],
  );

  useEffect(() => {
    if (!open || variant !== "dropdown") return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, variant]);

  const handleSignOut = () => {
    setOpen(false);
    onNavigate?.();
    void signOut({ callbackUrl: "/" });
  };

  const handleNavigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  if (variant === "list") {
    return (
      <div className={className}>
        <IdentityHeader user={user} onNavigate={handleNavigate} compact />
        <MenuSections
          sections={sections}
          onNavigate={handleNavigate}
          listVariant
          onSignOut={handleSignOut}
        />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border-subtle py-1 pl-1 pr-2.5 text-xs font-semibold text-foreground transition-colors hover:border-gold/35 hover:bg-surface-elevated"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs
          <img src={user.image} alt="" className="size-7 rounded-full object-cover" />
        ) : (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-gold/15 text-[10px] font-bold text-gold-bright">
            {userInitials(user)}
          </span>
        )}
        <span className="hidden max-w-[7rem] truncate lg:inline">@{user.username}</span>
        <ChevronIcon className={`size-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-[70] mt-2 max-h-[min(80vh,32rem)] w-72 overflow-y-auto rounded-xl border border-border-subtle bg-[#0a0a0c] py-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.85)]"
          role="menu"
        >
          <IdentityHeader user={user} onNavigate={handleNavigate} />
          <MenuSections
            sections={sections}
            onNavigate={handleNavigate}
            listVariant={false}
            onSignOut={handleSignOut}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function BroadcastIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
