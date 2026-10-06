"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveNowRoomCard } from "@/components/cards/LiveNowRoomCard";
import { liveNowFilters, type LiveNowRoom } from "@/content/live-rooms";
import { orderLiveDirectoryRooms } from "@/lib/live-discovery-order";
import { mapApiRowToLiveNowRoom, type LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";
import { getLiveCardSignals, getSignalScore } from "@/lib/live-signals";

type SortMode = "trending" | "viewers" | "activity" | "new";
type RoomMode = "auction" | "break" | "buy";

const PAGE_SIZE = 10;

function getRoomMode(room: LiveNowRoom): RoomMode {
  if (room.formatBadge === "Auction") return "auction";
  if (room.roomKind === "break_room") return "break";
  return "buy";
}

export default function LivePage() {
  const [dbRows, setDbRows] = useState<LiveRoomListApiRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<(typeof liveNowFilters)[number]>("All");
  const [sort, setSort] = useState<SortMode>("trending");
  const [query, setQuery] = useState("");
  const [toggles, setToggles] = useState<Record<RoomMode, boolean>>({
    auction: false,
    break: false,
    buy: false,
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const run = async () => {
      const res = await fetch("/api/live-rooms?limit=200", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { rooms?: LiveRoomListApiRow[] };
      setDbRows(Array.isArray(j.rooms) ? j.rooms : []);
    };
    void run();
  }, []);

  const liveShows = useMemo(() => dbRows.map(mapApiRowToLiveNowRoom), [dbRows]);

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeModes = (Object.keys(toggles) as RoomMode[]).filter((mode) => toggles[mode]);
    const modeFilterOn = activeModes.length > 0;

    const rooms = liveShows.filter((room) => {
      if (activeFilter !== "All" && room.category !== activeFilter) return false;
      if (modeFilterOn && !activeModes.includes(getRoomMode(room))) return false;
      if (!q) return true;
      return (
        room.title.toLowerCase().includes(q) ||
        room.formatBadge.toLowerCase().includes(q) ||
        room.category.toLowerCase().includes(q)
      );
    });

    if (sort === "viewers") return [...rooms].sort((a, b) => b.viewers - a.viewers);
    if (sort === "activity") return [...rooms].sort((a, b) => getSignalScore(b) - getSignalScore(a));
    if (sort === "new") return [...rooms].reverse();
    // Default "trending" matches mobile Live discovery: live (by viewers), then soonest scheduled.
    return orderLiveDirectoryRooms(rooms);
  }, [activeFilter, query, sort, toggles, liveShows]);

  /** Only truly live rooms — scheduled streams belong in the main grid, not under “Live right now”. */
  const featuredRooms = useMemo(
    () => filteredRooms.filter((room) => room.status === "live_now").slice(0, 3),
    [filteredRooms],
  );
  const featuredIds = useMemo(() => new Set(featuredRooms.map((room) => room.id)), [featuredRooms]);
  const mainRooms = useMemo(() => filteredRooms.filter((room) => !featuredIds.has(room.id)), [filteredRooms, featuredIds]);
  const highActivityRooms = useMemo(
    () => mainRooms.filter((room) => room.status === "live_now").sort((a, b) => getSignalScore(b) - getSignalScore(a)).slice(0, 5),
    [mainRooms],
  );
  const visibleRooms = useMemo(() => mainRooms.slice(0, visibleCount), [mainRooms, visibleCount]);
  const hasMore = visibleCount < mainRooms.length;
  const noRoomsAtAll = liveShows.length === 0;

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, mainRooms.length));
        }
      },
      { root: null, rootMargin: "300px 0px", threshold: 0.01 },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, mainRooms.length]);

  return (
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-4 py-10 sm:px-6 lg:px-10">
      <Link href="/#live-now" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Back to live on home
      </Link>

      <h1 className="font-display mt-6 text-2xl font-bold text-foreground sm:text-3xl">Live rooms</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Browse live breaks, auctions, and buy-now streams. Filter by category, sort by momentum, and jump straight into the
        room.
      </p>

      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.01] p-2.5 sm:p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2.5">
            {liveNowFilters.map((filter) => {
              const selected = filter === activeFilter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all sm:text-[11px] ${
                    selected
                      ? "border-gold/55 bg-gold/14 text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                      : "border-white/14 bg-white/[0.02] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-gold/25 hover:text-zinc-100"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search live rooms"
              className="h-8 w-[200px] rounded-md border border-white/12 bg-black/30 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-gold/45 focus:outline-none"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sort</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortMode);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-8 rounded-md border border-white/12 bg-black/30 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-100 focus:border-gold/45 focus:outline-none"
            >
              <option value="trending">Trending</option>
              <option value="viewers">Most viewers</option>
              <option value="activity">High activity</option>
              <option value="new">New</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["auction", "break", "buy"] as RoomMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setToggles((prev) => ({ ...prev, [mode]: !prev[mode] }));
                setVisibleCount(PAGE_SIZE);
              }}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                toggles[mode]
                  ? "border-gold/45 bg-gold/10 text-gold-bright"
                  : "border-white/12 bg-white/[0.015] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
          Showing {Math.min(visibleCount, mainRooms.length)} of {mainRooms.length} streams
        </p>
      </section>

      {featuredRooms.length > 0 ? (
        <section className="mt-8 rounded-xl border border-gold/20 bg-[linear-gradient(180deg,rgba(201,162,39,0.08)_0%,rgba(8,8,12,0.35)_100%)] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wide text-zinc-100">Featured Live</h2>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Live right now</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {featuredRooms.map((room) => (
              <LiveNowRoomCard key={`featured-${room.id}`} room={room} featured muted dynamicSignals={getLiveCardSignals(room)} />
            ))}
          </div>
        </section>
      ) : null}

      {highActivityRooms.length > 0 ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wide text-zinc-200">High Activity</h2>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Bids, spots, sales</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {highActivityRooms.map((room) => (
              <LiveNowRoomCard key={`activity-${room.id}`} room={room} muted dynamicSignals={getLiveCardSignals(room)} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-200">All Live Streams</h2>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">{mainRooms.length} rooms</p>
        </div>

        {visibleRooms.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
            {noRoomsAtAll
              ? "No live shows right now. Check back soon, or follow sellers you like so you catch the next drop."
              : "No rooms match these filters yet."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleRooms.map((room) => (
              <LiveNowRoomCard key={room.id} room={room} muted dynamicSignals={getLiveCardSignals(room)} />
            ))}
          </div>
        )}

        <div ref={loadMoreRef} className="h-10" aria-hidden />
        {hasMore ? <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-zinc-500">Loading more streams…</p> : null}
      </section>
    </main>
  );
}
