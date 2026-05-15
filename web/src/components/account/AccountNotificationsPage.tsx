"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { notificationLane, notificationLaneLabel, notificationTypeChip } from "@/lib/notification-catalog";
import type { NotificationLane } from "@/lib/notification-catalog";

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type LaneFilter = "all" | NotificationLane;

const FILTERS: { key: LaneFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "buying", label: "Buying" },
  { key: "selling", label: "Selling" },
  { key: "other", label: "Account" },
];

export function AccountNotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lane, setLane] = useState<LaneFilter>("all");

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { notifications?: NotifRow[]; unreadCount?: number };
      setRows(Array.isArray(j.notifications) ? j.notifications : []);
      setUnread(typeof j.unreadCount === "number" ? j.unreadCount : 0);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/signin?returnTo=${encodeURIComponent(pathname || "/account/notifications")}`);
    }
  }, [pathname, router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
  }, [load, status]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-notifications-updated", on);
    return () => window.removeEventListener("gv-notifications-updated", on);
  }, [load]);

  const filtered = useMemo(() => {
    if (lane === "all") return rows;
    return rows.filter((n) => notificationLane(n.type) === lane);
  }, [lane, rows]);

  const unreadInLane = useMemo(() => {
    if (lane === "all") return unread;
    return filtered.filter((n) => !n.readAt).length;
  }, [filtered, lane, unread]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
    window.dispatchEvent(new Event("gv-notifications-updated"));
  };

  const markAll = async () => {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    window.dispatchEvent(new Event("gv-notifications-updated"));
  };

  if (status === "loading" || status === "unauthenticated" || !session?.user) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Notifications</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Buying updates (payment, shipping, delivery) and selling updates (payments, labels, disputes) in one place.
          </p>
          <div className="mt-4">
            <AccountOrdersNav active="notifications" />
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const sel = lane === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setLane(f.key)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                    sel
                      ? "border-gold/45 bg-gold/12 text-gold-bright"
                      : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {unreadInLane > 0 ? (
              <span>
                <span className="font-semibold text-zinc-300">{unreadInLane}</span> unread
                {lane !== "all" ? ` in ${notificationLaneLabel(lane)}` : ""}
              </span>
            ) : (
              <span>All caught up{lane !== "all" ? ` in ${notificationLaneLabel(lane)}` : ""}.</span>
            )}
            {unread > 0 ? (
              <button type="button" onClick={() => void markAll()} className="font-semibold text-gold-bright/90 hover:text-gold-bright">
                Mark all read
              </button>
            ) : null}
          </div>
        </div>

        <section className="mt-4 space-y-2" aria-label="Notification list">
          {loading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
              <p className="text-sm text-zinc-400">
                {rows.length === 0
                  ? "No notifications yet — bids, orders, and payouts will show up here."
                  : `No ${lane === "all" ? "" : `${notificationLaneLabel(lane).toLowerCase()} `}notifications in this view.`}
              </p>
              {rows.length === 0 ? (
                <Link href="/marketplace" className="mt-4 inline-block text-xs font-semibold text-gold-bright hover:underline">
                  Browse marketplace
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setLane("all")}
                  className="mt-4 text-xs font-semibold text-gold-bright hover:underline"
                >
                  Show all notifications
                </button>
              )}
            </div>
          ) : (
            filtered.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => {
                  if (!n.readAt) void markRead(n.id);
                }}
                className={`block rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3 transition hover:border-gold/25 hover:bg-white/[0.02] ${n.readAt ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{n.title}</p>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                        {notificationTypeChip(n.type)}
                      </span>
                      <span className="rounded border border-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">
                        {notificationLaneLabel(notificationLane(n.type))}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{n.body}</p>
                    {!n.readAt ? <p className="mt-2 text-[10px] font-medium text-gold-bright/80">Unread</p> : null}
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{formatTime(n.createdAt)}</span>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
