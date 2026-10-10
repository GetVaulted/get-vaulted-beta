"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Hit = { type: "user" | "order" | "show" | "refund"; id: string; title: string; subtitle: string; href: string };

const TYPE_LABEL: Record<Hit["type"], string> = { user: "User", order: "Order", show: "Show", refund: "Refund" };

/** One box in the admin header: @username, email, order id, show title, refund request. Press "/" to focus. */
export function AdminGlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const j = (await res.json()) as { hits?: Hit[] };
        setHits(Array.isArray(j.hits) ? j.hits : []);
        setOpen(true);
      } catch {
        /* aborted or offline */
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <label htmlFor="admin-global-search" className="sr-only">
        Search users, orders, shows, refunds
      </label>
      <input
        id="admin-global-search"
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder="Search @user, email, order id, show…  ( / )"
        autoComplete="off"
        className="w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-gold/40 focus:outline-none"
      />
      {open && q.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0a0a0d] p-1 shadow-2xl">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">{busy ? "Searching…" : "No matches."}</p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={`${h.type}-${h.id}`}>
                  <Link
                    href={h.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-white/[0.05]"
                  >
                    <span className="mt-0.5 w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gold/80">
                      {TYPE_LABEL[h.type]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-zinc-200">{h.title}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{h.subtitle}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
