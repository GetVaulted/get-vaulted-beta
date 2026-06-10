"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type NotifRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

function formatNotifTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type NavbarNotificationsBellProps = {
  /** Merged into the bell trigger button (e.g. min tap target on mobile). */
  triggerClassName?: string;
};

export function NavbarNotificationsBell({ triggerClassName = "" }: NavbarNotificationsBellProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=12", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { notifications?: NotifRow[]; unreadCount?: number };
      setItems(Array.isArray(j.notifications) ? j.notifications : []);
      setUnread(typeof j.unreadCount === "number" ? j.unreadCount : 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-notifications-updated", on);
    return () => window.removeEventListener("gv-notifications-updated", on);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
    window.dispatchEvent(new Event("gv-notifications-updated"));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    window.dispatchEvent(new Event("gv-notifications-updated"));
    setOpen(false);
    router.refresh();
  };

  const badge = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className={`relative rounded-full p-2 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground ${triggerClassName}`.trim()}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon className="size-5" />
        {badge ? (
          <span className="absolute right-0.5 top-0.5 flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[60] mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-border-subtle bg-[#0c0c10] py-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 pb-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[10px] font-semibold text-gold-bright/90 hover:text-gold-bright"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,20rem)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">No notifications yet.</p>
            ) : (
              <ul className="py-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!n.readAt) void markOneRead(n.id);
                        setOpen(false);
                      }}
                      className={`block px-3 py-2.5 transition hover:bg-white/[0.04] ${n.readAt ? "opacity-75" : ""}`}
                    >
                      <p className="text-xs font-semibold text-zinc-100">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{n.body}</p>
                      <p className="mt-1 text-[10px] text-zinc-600">{formatNotifTime(n.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-white/[0.06] px-3 pt-2">
            <Link
              href="/account/notifications"
              className="block py-1.5 text-center text-[11px] font-semibold text-gold-bright/90 hover:text-gold-bright"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
