"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveNowRoomCard } from "@/components/cards/LiveNowRoomCard";
import { MarketRowHeader } from "@/components/layout/MarketRowHeader";
import { useLiveMarketplaceEnabled } from "@/components/providers/LiveMarketplaceGateProvider";
import { liveNowFilters, type LiveNowRoom } from "@/content/live-rooms";
import { mapApiRowToLiveNowRoom, type LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";

export function LiveNowSection() {
  const liveMarketplaceEnabled = useLiveMarketplaceEnabled();
  const [dbRows, setDbRows] = useState<LiveRoomListApiRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<(typeof liveNowFilters)[number]>("All");

  useEffect(() => {
    if (!liveMarketplaceEnabled) {
      setDbRows([]);
      return;
    }
    const run = async () => {
      const res = await fetch("/api/live-rooms?limit=24", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { rooms?: LiveRoomListApiRow[] };
      setDbRows(Array.isArray(j.rooms) ? j.rooms : []);
    };
    void run();
  }, [liveMarketplaceEnabled]);

  const liveNowRooms = useMemo(() => dbRows.map(mapApiRowToLiveNowRoom).filter((r) => r.status === "live_now"), [dbRows]);

  const visibleRooms = useMemo(
    () => (activeFilter === "All" ? liveNowRooms : liveNowRooms.filter((r) => r.category === activeFilter)),
    [activeFilter, liveNowRooms],
  );

  if (!liveMarketplaceEnabled) {
    return (
      <section
        id="live-now"
        className="scroll-mt-16 border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,9,12,0.92)_0%,rgba(5,5,8,0.97)_100%)] py-9 sm:py-11"
        aria-labelledby="live-now-title"
      >
        <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5 sm:p-3">
            <MarketRowHeader
              titleId="live-now-title"
              title="Live shows"
              actionLabel="Coming soon"
              actionHref="/coming-soon"
            />
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-4 py-12 text-center sm:px-8 sm:py-14">
              <p className="text-sm font-medium text-zinc-200">Live breaks open with the full marketplace launch.</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                You can still shop listings, sell graded cards, and use checkout—live rooms stay closed until we flip the
                switch.
              </p>
              <Link
                href="/coming-soon"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
              >
                Read update
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="live-now"
      className="scroll-mt-16 border-b border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,9,12,0.92)_0%,rgba(5,5,8,0.97)_100%)] py-9 sm:py-11"
      aria-labelledby="live-now-title"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5 sm:p-3">
          <MarketRowHeader
            titleId="live-now-title"
            title="Live now"
            livePulse
            actionLabel="View all"
            actionHref="/live"
          />
          <div className="mb-5 mt-4 rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(201,162,39,0.06)_0%,rgba(255,255,255,0.02)_100%)] px-2.5 py-2.5 sm:mb-6 sm:mt-5 sm:px-3">
            <div className="flex flex-wrap gap-2.5 sm:gap-3">
              {liveNowFilters.map((f) => {
                const selected = f === activeFilter;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={`rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all sm:text-[11px] ${
                      selected
                        ? "border-gold/60 bg-gold/20 text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_20px_-10px_rgba(201,162,39,0.75)]"
                        : "border-white/14 bg-white/[0.03] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-gold/25 hover:text-zinc-100"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="px-1 sm:px-1.5 lg:px-2">
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-[1.125rem] lg:grid-cols-6 lg:gap-x-[1.125rem] lg:gap-y-5">
              {visibleRooms.length === 0 ? (
                <p className="col-span-full py-6 text-center text-sm text-zinc-500">No live rooms right now. Check back soon.</p>
              ) : (
                visibleRooms.map((room: LiveNowRoom) => (
                  <LiveNowRoomCard key={room.id} room={room} featured={room.id === visibleRooms[0]?.id} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
