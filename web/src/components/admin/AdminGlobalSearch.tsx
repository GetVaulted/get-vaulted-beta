"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pill,
  UserAlerts,
  UserSafetyChecks,
  UserStatTiles,
  UserTags,
  fmtDate,
  fmtUsd,
  initialsFor,
  orderStatusPill,
  useAdminUserSummary,
} from "@/components/admin/AdminUserSummaryParts";

type Hit = { type: "user" | "order" | "show" | "refund"; id: string; title: string; subtitle: string; href: string };

const TYPE_ORDER: Hit["type"][] = ["user", "order", "show", "refund"];
const TYPE_HEADING: Record<Hit["type"], string> = { user: "Users", order: "Orders", show: "Live shows", refund: "Refunds" };

/**
 * Admin header search. Type a username, email, order id, payment id or show title; results are grouped by type
 * and the highlighted user is previewed on the right (money, disputes, alerts, recent orders, safety checks)
 * without leaving the page. "/" focuses it, arrow keys move, Enter opens, Escape closes.
 */
export function AdminGlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
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
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) return;
        const j = (await res.json()) as { hits?: Hit[] };
        setHits(Array.isArray(j.hits) ? j.hits : []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline */
      } finally {
        setBusy(false);
      }
    }, 200);
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

  // Results in display order (grouped), so arrow keys walk them top to bottom.
  const ordered = useMemo(() => TYPE_ORDER.flatMap((t) => hits.filter((h) => h.type === t)), [hits]);
  const activeHit = ordered[Math.min(active, ordered.length - 1)] ?? null;
  const previewUserId = activeHit?.type === "user" ? activeHit.id : null;

  const go = (h: Hit) => {
    setOpen(false);
    router.push(h.href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || ordered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeHit) {
      e.preventDefault();
      go(activeHit);
    }
  };

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-2xl">
      <label htmlFor="admin-global-search" className="sr-only">
        Search users, orders, shows and refunds
      </label>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#141418] px-3.5 py-2 text-zinc-400 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="admin-global-search"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onInputKey}
          placeholder="Search username, email, order #, payment ID, show…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="admin-search-results"
          aria-activedescendant={activeHit ? `admin-hit-${activeHit.type}-${activeHit.id}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        {busy ? <span className="text-xs text-zinc-500">Searching…</span> : null}
        <kbd className="hidden rounded-md border border-white/15 px-1.5 font-mono text-xs text-zinc-400 sm:inline">/</kbd>
      </div>

      {showPanel ? (
        <div className="absolute left-0 top-full z-50 mt-2 flex w-[min(1040px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl md:flex-row">
          <div id="admin-search-results" role="listbox" aria-label="Search results" className="max-h-[70vh] overflow-y-auto p-2 md:w-[340px] md:shrink-0 md:border-r md:border-white/[0.06]">
            {ordered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-zinc-400">{busy ? "Searching…" : "No matches. Try an email, order # or payment ID."}</p>
            ) : (
              TYPE_ORDER.filter((t) => ordered.some((h) => h.type === t)).map((t) => (
                <div key={t} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{TYPE_HEADING[t]}</p>
                  {ordered
                    .map((h, i) => ({ h, i }))
                    .filter(({ h }) => h.type === t)
                    .map(({ h, i }) => {
                      const on = i === active;
                      return (
                        <Link
                          key={`${h.type}-${h.id}`}
                          id={`admin-hit-${h.type}-${h.id}`}
                          role="option"
                          aria-selected={on}
                          href={h.href}
                          onMouseEnter={() => setActive(i)}
                          onFocus={() => setActive(i)}
                          onClick={() => setOpen(false)}
                          className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-3 py-2 ${
                            on ? "border-gold/40 bg-gold/10" : "border-transparent hover:bg-white/[0.04]"
                          }`}
                        >
                          {h.type === "user" ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#23232a] text-xs font-semibold text-gold-bright">
                              {(h.title.replace(/^@/, "")[0] ?? "?").toUpperCase()}
                            </span>
                          ) : null}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-zinc-100">{h.title}</span>
                            <span className="block truncate text-xs text-zinc-400">{h.subtitle}</span>
                          </span>
                        </Link>
                      );
                    })}
                </div>
              ))
            )}
          </div>
          <div className="hidden max-h-[70vh] min-w-0 flex-1 overflow-y-auto p-5 md:block">
            {previewUserId ? (
              <UserPreview userId={previewUserId} href={activeHit!.href} onOpen={() => setOpen(false)} />
            ) : activeHit ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">{TYPE_HEADING[activeHit.type].replace(/s$/, "")}</p>
                <p className="text-lg font-semibold text-zinc-100">{activeHit.title}</p>
                <p className="text-sm text-zinc-400">{activeHit.subtitle}</p>
                <Link href={activeHit.href} onClick={() => setOpen(false)} className="w-fit rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:bg-gold-bright">
                  Open
                </Link>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Highlight a user to see everything about them here.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserPreview({ userId, href, onOpen }: { userId: string; href: string; onOpen: () => void }) {
  const { summary, error, loading } = useAdminUserSummary(userId);
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!summary) return <p className="text-sm text-zinc-400">{loading ? "Loading…" : ""}</p>;
  const u = summary.user;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-br from-[#3a3220] to-[#1c1a14] text-lg font-semibold text-gold-bright">
          {initialsFor(u)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold text-zinc-50">@{u.username ?? "(no username)"}</p>
          <p className="truncate text-[13px] text-zinc-400">
            {[u.name, u.email, u.phone].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[13px] text-zinc-500">Joined {fmtDate(u.createdAt)}</p>
        </div>
        <Link href={href} onClick={onOpen} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:bg-gold-bright">
          Open full profile
        </Link>
      </div>
      <UserTags summary={summary} />
      <UserAlerts summary={summary} />
      <UserStatTiles summary={summary} compact />
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold text-zinc-100">Latest orders</p>
          {summary.recentOrders.length === 0 ? (
            <p className="text-[13px] text-zinc-400">No orders yet.</p>
          ) : (
            summary.recentOrders.slice(0, 3).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 border-t border-white/[0.06] py-2 text-[13px]">
                <span className="min-w-0 truncate text-zinc-200">
                  <span className="text-zinc-500">{o.role === "buyer" ? "Bought" : "Sold"} · </span>
                  {o.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-zinc-300">{fmtUsd(o.totalUsd)}</span>
                  {orderStatusPill(o)}
                </span>
              </div>
            ))
          )}
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-zinc-100">Safety</p>
          <UserSafetyChecks summary={summary} />
        </div>
      </div>
      {u.role === "admin" ? <Pill tone="neutral">This is an admin account</Pill> : null}
    </div>
  );
}
