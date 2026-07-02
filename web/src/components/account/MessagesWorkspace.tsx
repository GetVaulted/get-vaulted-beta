"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";

export type ThreadListItem = {
  id: string;
  listingId: string;
  listingTitle: string;
  otherUserId: string;
  otherUsername: string;
  lastPreview: string;
  lastAt: string;
  unreadCount: number;
  inbox?: "primary" | "request";
};

function formatThreadTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function MessagesWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const [inbox, setInbox] = useState<"primary" | "request">("primary");
  const [threads, setThreads] = useState<ThreadListItem[] | null>(null);
  const [requestCount, setRequestCount] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/account/threads?inbox=${inbox}`);
    if (!res.ok) {
      setThreads([]);
      setRequestCount(0);
      return;
    }
    const data = (await res.json()) as { threads?: ThreadListItem[]; requestCount?: number };
    setThreads(Array.isArray(data.threads) ? data.threads : []);
    setRequestCount(typeof data.requestCount === "number" ? data.requestCount : 0);
  }, [inbox]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-messages-updated", on);
    return () => window.removeEventListener("gv-messages-updated", on);
  }, [load]);

  const isThreadRoute = /^\/account\/messages\/[^/]+$/.test(pathname);

  if (status === "loading" || (status === "authenticated" && threads === null)) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Messages</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Conversations with buyers and sellers.</p>
          <div className="mt-4">
            <AccountOrdersNav active="messages" />
          </div>
        </header>

        <div className="mt-6 flex min-h-[min(560px,calc(100vh-12rem))] flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:flex-row">
          <aside
            className={`flex w-full shrink-0 flex-col border-white/[0.08] md:w-[min(100%,320px)] md:border-r ${
              isThreadRoute ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="border-b border-white/[0.08] px-3 py-2.5">
              <div className="flex gap-1 rounded-full bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setInbox("primary")}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    inbox === "primary" ? "bg-gold/15 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => setInbox("request")}
                  className={`relative flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    inbox === "request" ? "bg-gold/15 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Requests
                  {requestCount > 0 ? (
                    <span className="ml-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                      {requestCount > 9 ? "9+" : requestCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {threads && threads.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-zinc-500">
                  {inbox === "request"
                    ? "No message requests yet."
                    : "No conversations yet. Message someone from their profile or a listing."}
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {(threads ?? []).map((t) => {
                    const tail = decodeURIComponent(pathname.split("/").pop() ?? "");
                    const active = tail === t.id && pathname.startsWith("/account/messages/");
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/account/messages/${encodeURIComponent(t.id)}`}
                          className={`block px-3 py-2.5 transition hover:bg-white/[0.03] ${active ? "bg-gold/[0.06]" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-200">@{t.otherUsername}</span>
                            <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{formatThreadTime(t.lastAt)}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{t.listingTitle}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">{t.lastPreview || "—"}</p>
                          {t.unreadCount > 0 ? (
                            <span className="mt-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-gold-bright px-1 py-0.5 text-[9px] font-bold leading-none text-zinc-950 shadow-[0_0_8px_rgba(232,212,139,0.35)]">
                              {t.unreadCount > 9 ? "9+" : t.unreadCount}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${isThreadRoute ? "flex" : "hidden md:flex"}`}
          >
            {isThreadRoute ? (
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2 md:hidden">
                <Link
                  href="/account/messages"
                  className="inline-flex h-9 items-center rounded-lg border border-white/12 px-3 text-xs font-semibold text-zinc-300"
                >
                  ← Inbox
                </Link>
              </div>
            ) : null}
            <div className="min-h-0 flex-1">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
