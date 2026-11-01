"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_PINNED,
  activeAdminNavHref,
  adminNavGroupIdForHref,
} from "@/lib/admin/admin-modules";

/** Stroke icons (24px grid) for the nav. Decorative: every link also has its text label. */
const ICON: Record<string, string> = {
  "/admin": "M3 11l9-7 9 7M5 10v10h14V10",
  "/admin/attention": "M12 3l10 18H2L12 3zM12 10v5M12 18h.01",
  money: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 12h.01M17 12h.01",
  orders: "M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10",
  live: "M4 6h16v12H4zM10 9l5 3-5 3V9z",
  people:
    "M16 20v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 11a4 4 0 100-8 4 4 0 000 8zM22 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  platform: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
};

function Icon({ k }: { k: string }) {
  const d = ICON[k];
  if (!d) return <span className="w-4" aria-hidden />;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

const linkClass = (active: boolean) =>
  `flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 text-sm transition ${
    active ? "bg-gold/15 font-semibold text-gold-bright" : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100"
  }`;

/** Live count for the "Needs attention" badge (refreshes every 2 minutes). */
function useAttentionTotal(): number | null {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/attention", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { total?: number } | null) => {
          if (alive && j && typeof j.total === "number") setTotal(j.total);
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return total;
}

/** Grouped admin navigation. The section that holds the current page is open; the others fold away. */
export function AdminNavGroups({ onNavigate }: { onNavigate?: () => void }) {
  // Next can briefly return null from usePathname during hydration/nav — never call string methods on it.
  const pathname = usePathname() ?? "";
  const activeHref = activeAdminNavHref(pathname);
  const activeGroup = adminNavGroupIdForHref(activeHref);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const attention = useAttentionTotal();

  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      <div className="flex flex-col gap-0.5 pb-2">
        {ADMIN_NAV_PINNED.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={linkClass(activeHref === l.href)}
            aria-current={activeHref === l.href ? "page" : undefined}
          >
            <Icon k={l.href} />
            <span className="flex-1">{l.label}</span>
            {l.href === "/admin/attention" && attention ? (
              <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-semibold text-orange-300">
                {attention > 99 ? "99+" : attention}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      {ADMIN_NAV_GROUPS.map((g) => {
        const isOpen = open[g.id] ?? g.id === activeGroup;
        const panelId = `admin-nav-${g.id}`;
        return (
          <div key={g.id} className="border-t border-white/[0.06] pt-1">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen((prev) => ({ ...prev, [g.id]: !isOpen }))}
              className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-semibold transition hover:bg-white/[0.04] ${
                g.id === activeGroup ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon k={g.id} />
              <span className="flex-1 text-left">{g.label}</span>
              <span aria-hidden className={`text-sm text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            {isOpen ? (
              <div id={panelId} className="flex flex-col gap-0.5 pb-1.5 pl-[26px]">
                {g.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={onNavigate}
                    className={linkClass(activeHref === l.href)}
                    aria-current={activeHref === l.href ? "page" : undefined}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Top bar: brand, search (with instant user preview), back to site, and the menu button on small screens. */
export function AdminNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0b0b0e]/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-3 px-3 py-3 sm:px-4 lg:gap-6 lg:px-7">
        <Link href="/admin" className="text-[15px] font-semibold text-zinc-100 hover:text-gold-bright">
          Ops Command
        </Link>
        <div className="order-3 w-full lg:order-none lg:w-auto lg:flex-1">
          <AdminGlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/" className="text-[13px] font-medium text-zinc-400 hover:text-zinc-200">
            View site
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-h-[40px] rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.04] lg:hidden"
          >
            {menuOpen ? "Close menu" : "Menu"}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div id="admin-mobile-menu" className="max-h-[70vh] overflow-y-auto border-t border-white/[0.06] px-3 py-3 sm:px-4 lg:hidden">
          <AdminNavGroups onNavigate={() => setMenuOpen(false)} />
        </div>
      ) : null}
    </header>
  );
}

/** Desktop sidebar (hidden below lg; small screens use the Menu button). */
export function AdminSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] bg-[#0b0b0e] lg:block">
      <div className="sticky top-[61px] max-h-[calc(100vh-61px)] overflow-y-auto px-3 py-5">
        <AdminNavGroups />
      </div>
    </aside>
  );
}
