"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_LINKS } from "@/lib/admin/admin-modules";

export function AdminNav() {
  const pathname = usePathname();

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
        <nav className="flex max-w-full flex-wrap gap-1 overflow-x-auto" aria-label="Admin">
          {ADMIN_NAV_LINKS.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${
                  active ? "bg-gold/15 text-gold-bright" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
