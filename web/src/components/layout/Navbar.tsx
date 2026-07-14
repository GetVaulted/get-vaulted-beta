"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLiveMarketplaceEnabled } from "@/components/providers/LiveMarketplaceGateProvider";
import { NavbarAccountMenu } from "@/components/layout/NavbarAccountMenu";
import { NavbarNotificationsBell } from "@/components/layout/NavbarNotificationsBell";
import { marketplaceSearchHref } from "@/lib/marketplace-search-url";

const navLinks = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/live", label: "Live" },
  { href: "/merch", label: "Merch" },
  { href: "/trade", label: "Trade" },
] as const;

const MOBILE_ICON_BTN =
  "inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-elevated hover:text-foreground";

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const [slidIn, setSlidIn] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLElement>(null);
  const avatarPullAttemptedRef = useRef(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const drawerTitleId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const isSellerOnboarding = pathname?.startsWith("/account/seller/setup") ?? false;
  const { data: session, status, update: updateSession } = useSession();
  const hideOnMobileLiveRoom = /^\/live\/[^/]+/.test(pathname ?? "");
  const liveMarketplaceEnabled = useLiveMarketplaceEnabled();
  const menuImage = session?.user?.image?.trim() || avatarUrl;
  const primaryNav = useMemo(
    () =>
      navLinks.map((item) =>
        item.href === "/live"
          ? { ...item, href: liveMarketplaceEnabled ? "/live" : "/coming-soon" }
          : item,
      ),
    [liveMarketplaceEnabled],
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Mobile may have saved avatar to Supabase before Prisma/session had it — pull once if nav has no photo.
  useEffect(() => {
    if (status !== "authenticated") return;
    const sessionImage = session?.user?.image?.trim() || null;
    if (sessionImage) {
      setAvatarUrl(sessionImage);
      return;
    }
    if (avatarPullAttemptedRef.current) return;
    avatarPullAttemptedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => ({}))) as { user?: { image?: string | null } };
        const image = j.user?.image?.trim() || null;
        if (cancelled || !image) return;
        setAvatarUrl(image);
        await updateSession({ image });
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.image, status, updateSession]);

  useEffect(() => {
    if (open) {
      setShowPortal(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlidIn(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setSlidIn(false);
    const t = window.setTimeout(() => setShowPortal(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useBodyScrollLock(showPortal);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || !slidIn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, slidIn, closeMenu]);

  useEffect(() => {
    if (!open || !slidIn) return;
    closeBtnRef.current?.focus();
  }, [open, slidIn]);

  useEffect(() => {
    if (hideOnMobileLiveRoom) setOpen(false);
  }, [hideOnMobileLiveRoom]);

  const toggleMenu = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (process.env.NODE_ENV === "development") {
        console.debug("[Navbar] mobile menu toggle →", next ? "open" : "closed");
      }
      return next;
    });
  }, []);

  const submitSearch = useCallback(
    (raw?: string) => {
      const q = (raw ?? searchDraft).trim();
      setSearchOpen(false);
      setOpen(false);
      router.push(marketplaceSearchHref(q));
    },
    [router, searchDraft],
  );

  const onBackdropPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drawerPanelRef.current?.contains(e.target as Node)) return;
      closeMenu();
    },
    [closeMenu],
  );

  const mobileDrawer =
    hydrated && showPortal
      ? createPortal(
          <div className="fixed inset-0 z-[200] md:hidden" onPointerDown={onBackdropPointerDown} role="presentation">
            <div
              className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${
                slidIn ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden
            />
            <aside
              ref={drawerPanelRef}
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-labelledby={drawerTitleId}
              className={`absolute right-0 top-0 z-10 flex h-[100dvh] max-h-[100dvh] w-[min(100vw,22rem)] flex-col border-l border-border-subtle bg-[#0a0a0c] shadow-[0_0_48px_-12px_rgba(0,0,0,0.9)] transition-transform duration-300 ease-out ${
                slidIn ? "translate-x-0" : "translate-x-full"
              }`}
              style={{
                paddingTop: "max(0.75rem, env(safe-area-inset-top))",
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 pb-3">
                <p id={drawerTitleId} className="text-sm font-semibold text-foreground">
                  Menu
                </p>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={closeMenu}
                  className={`${MOBILE_ICON_BTN} -mr-1`}
                  aria-label="Close menu"
                >
                  <CloseIcon className="size-6" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-2">
                {status === "loading" ? (
                  <div className="px-3 pt-2">
                    <div className="h-11 rounded-xl bg-white/[0.06]" aria-hidden />
                  </div>
                ) : status === "authenticated" && session?.user ? (
                  <NavbarAccountMenu
                    user={{
                      username: session.user.username,
                      name: session.user.name,
                      email: session.user.email,
                      image: menuImage,
                    }}
                    isAdmin={session.user.role === "admin"}
                    variant="list"
                    onNavigate={closeMenu}
                  />
                ) : (
                  <div className="px-3 pt-2">
                    <Link
                      href="/signin"
                      className="block rounded-xl border border-border-subtle px-3 py-3 text-center text-base font-medium text-foreground transition-colors hover:bg-surface-elevated"
                      onClick={closeMenu}
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/join"
                      className="mt-3 block rounded-xl bg-gold px-3 py-3 text-center text-base font-semibold text-background shadow-[0_0_24px_-4px_rgba(201,162,39,0.45)] transition-all duration-200 hover:brightness-110"
                      onClick={closeMenu}
                    >
                      Join Now
                    </Link>
                  </div>
                )}
                {!isSellerOnboarding ? (
                  <>
                    <div className="mx-3 my-4 border-t border-white/[0.06]" />
                    <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Explore</p>
                    <nav className="flex flex-col gap-0.5 px-1" aria-label="Primary">
                      {primaryNav.map(({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          className="rounded-xl px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-surface-elevated active:bg-surface-elevated"
                          onClick={closeMenu}
                        >
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </>
                ) : null}
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {mobileDrawer}
      <header
        className={`relative sticky top-0 z-[70] w-full border-b border-border-subtle bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md ${
          hideOnMobileLiveRoom ? "hidden md:block" : ""
        }`}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1920px] min-w-0 items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-10">
          <Link
            href="/"
            aria-label="Get Vaulted — home"
            className="inline-flex shrink-0 items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG; native scaling, no Next/Image optimizer needed */}
            <img
              src="/brand/white-logo.svg"
              alt="Get Vaulted"
              width={468}
              height={132}
              className="h-7 w-auto sm:h-8"
              draggable={false}
            />
          </Link>

          <nav className={`hidden min-w-0 items-center gap-1 md:flex lg:gap-2 ${isSellerOnboarding ? "!hidden" : ""}`}>
            {primaryNav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className={`mx-auto hidden min-w-0 max-w-md flex-1 md:block lg:max-w-lg ${isSellerOnboarding ? "!hidden" : ""}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.elements.namedItem("site-search") as HTMLInputElement | null;
                submitSearch(input?.value ?? searchDraft);
              }}
            >
              <label htmlFor="site-search" className="sr-only">
                Search
              </label>
              <div className="relative">
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute inset-y-0 left-0 flex w-8 items-center justify-center text-muted transition-colors hover:text-foreground"
                >
                  <SearchIcon className="size-3.5" aria-hidden />
                </button>
                <input
                  id="site-search"
                  name="site-search"
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search listings, breaks, sellers…"
                  className="h-9 w-full rounded-full border border-border-subtle bg-surface pl-9 pr-3 text-xs text-foreground placeholder:text-muted outline-none ring-gold/30 transition-[border-color,box-shadow] focus:border-gold/40 focus:ring-2"
                />
              </div>
            </form>
          </div>

          {searchOpen && !isSellerOnboarding ? (
            <form
              className="absolute inset-x-3 top-[calc(100%+0.35rem)] z-30 md:hidden"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch();
              }}
            >
              <div className="relative rounded-full border border-border-subtle bg-[#0a0a0c] shadow-lg">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                  <SearchIcon className="size-4" aria-hidden />
                </span>
                <input
                  autoFocus
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search listings, sellers…"
                  className="h-11 w-full rounded-full bg-transparent pl-10 pr-20 text-sm text-foreground outline-none"
                />
                <button
                  type="submit"
                  className="absolute inset-y-1 right-1 rounded-full bg-gold px-3 text-xs font-bold text-background"
                >
                  Go
                </button>
              </div>
            </form>
          ) : null}

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-3 md:gap-3">
            <button
              type="button"
              className={`${MOBILE_ICON_BTN} md:hidden ${isSellerOnboarding ? "hidden" : ""}`}
              aria-label={searchOpen ? "Close search" : "Open search"}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              <SearchIcon className="size-5" />
            </button>
            {status === "authenticated" && session?.user ? (
              <>
                <NavbarNotificationsBell
                  triggerClassName={`!p-0 min-h-11 min-w-11 inline-flex items-center justify-center touch-manipulation ${isSellerOnboarding ? "hidden md:hidden" : ""}`}
                />
                <NavbarAccountMenu
                  user={{
                    username: session.user.username,
                    name: session.user.name,
                    email: session.user.email,
                    image: menuImage,
                  }}
                  isAdmin={session.user.role === "admin"}
                  className="hidden md:block"
                />
              </>
            ) : status === "loading" ? null : (
              <Link
                href="/signin"
                className="hidden rounded-full border border-border-subtle px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-gold/35 hover:bg-surface-elevated md:inline-flex"
              >
                Sign in
              </Link>
            )}
            {status === "unauthenticated" && (
              <Link
                href="/join"
                className="hidden rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background shadow-[0_0_24px_-4px_rgba(201,162,39,0.45)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_32px_-2px_rgba(232,212,139,0.35)] active:scale-[0.98] md:inline-flex"
              >
                Join Now
              </Link>
            )}

            <button
              type="button"
              className={`${MOBILE_ICON_BTN} md:hidden`}
              onClick={toggleMenu}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <MenuIcon className="size-6" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
