"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_PINNED,
  activeAdminNavHref,
  adminNavGroupIdForHref,
} from "@/lib/admin/admin-modules";

const linkClass = (active: boolean) =>
  `block rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
    active ? "bg-gold/15 text-gold-bright" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
  }`;

/** Grouped admin navigation. The section that holds the current page is open; the others fold away. */
export function AdminNavGroups({ onNavigate }: { onNavigate?: () => void }) {
  // Next can briefly return null from usePathname during hydration/nav — never call string methods on it.
  const pathname = usePathname() ?? "";
  const activeHref = activeAdminNavHref(pathname);
  const activeGroup = adminNavGroupIdForHref(activeHref);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      <div className="flex flex-col gap-0.5 pb-2">
        {ADMIN_NAV_PINNED.map((l) => (
          <Link key={l.href} href={l.href} onClick={onNavigate} className={linkClass(activeHref === l.href)}>
            {l.label}
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
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 transition hover:text-zinc-300"
            >
              <span>{g.label}</span>
              <span aria-hidden className={`text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            {isOpen ? (
              <div id={panelId} className="flex flex-col gap-0.5 pb-1">
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

/** Slim top bar: back to site, title, search, and the menu button on small screens. */
export function AdminNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-white/[0.08] bg-[#08080a]/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
            ← Site
          </Link>
          <p className="font-display text-sm font-bold tracking-tight text-foreground">
            <span className="text-gold-bright">Ops Command</span>
            <span className="text-zinc-500"> · Get Vaulted</span>
          </p>
        </div>
        <AdminGlobalSearch />
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] lg:hidden"
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </div>
      {menuOpen ? (
        <div id="admin-mobile-menu" className="border-t border-white/[0.06] px-3 py-3 sm:px-4 lg:hidden">
          <AdminNavGroups onNavigate={() => setMenuOpen(false)} />
        </div>
      ) : null}
    </header>
  );
}

/** Desktop sidebar (hidden below lg; small screens use the Menu button). */
export function AdminSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/[0.06] bg-[#08080a]/60 lg:block">
      <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-5">
        <AdminNavGroups />
      </div>
    </aside>
  );
}
