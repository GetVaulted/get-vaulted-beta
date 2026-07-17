"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UpcomingBreakCard } from "@/components/cards/UpcomingBreakCard";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { useLiveMarketplaceEnabled } from "@/components/providers/LiveMarketplaceGateProvider";
import { LIVE_DISCOVERY_WINDOW_EVENT } from "@/lib/live-discovery-realtime";
import type { LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";

function scheduledCardProps(row: LiveRoomListApiRow) {
  const iso = row.scheduledStartAt;
  const d = iso ? new Date(iso) : null;
  const valid = d && !Number.isNaN(d.getTime());
  const weekday = valid ? d!.toLocaleDateString("en-US", { weekday: "short" }) : "—";
  const month = valid ? d!.toLocaleDateString("en-US", { month: "short" }) : "";
  const dayNum = valid ? d!.getDate() : null;
  const day = valid && month && dayNum != null ? `${month} ${dayNum}` : "TBD";
  const time = valid
    ? d!.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "Time TBD";
  const kind = row.roomType === "break" ? "Break room" : row.roomType === "auction" ? "Live auction" : "Live sale";
  const spots = `${kind} · ${row.itemCount} item${row.itemCount === 1 ? "" : "s"}`;
  return {
    day,
    weekday,
    time,
    title: row.title,
    spots,
    price: 0,
    priceLabel: "View room",
    seed: row.id,
    imageUrl: row.thumbnailUrl?.trim() || undefined,
    href: `/live/${encodeURIComponent(row.id)}`,
  };
}

export function UpcomingBreaksSection() {
  const liveMarketplaceEnabled = useLiveMarketplaceEnabled();
  const [rows, setRows] = useState<LiveRoomListApiRow[] | null>(null);

  useEffect(() => {
    if (!liveMarketplaceEnabled) {
      setRows([]);
      return;
    }
    const run = async () => {
      try {
        const res = await fetch("/api/live-rooms?limit=80", { cache: "no-store" });
        if (!res.ok) {
          setRows([]);
          return;
        }
        const j = (await res.json()) as { rooms?: LiveRoomListApiRow[] };
        setRows(Array.isArray(j.rooms) ? j.rooms : []);
      } catch {
        setRows([]);
      }
    };
    void run();
    const onDiscoveryChange = () => void run();
    window.addEventListener(LIVE_DISCOVERY_WINDOW_EVENT, onDiscoveryChange);
    return () => window.removeEventListener(LIVE_DISCOVERY_WINDOW_EVENT, onDiscoveryChange);
  }, [liveMarketplaceEnabled]);

  const cards = useMemo(() => {
    if (!liveMarketplaceEnabled || !rows) return [];
    const scheduled = rows.filter((r) => r.status === "scheduled" && r.scheduledStartAt);
    scheduled.sort((a, b) => {
      const ta = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    return scheduled.slice(0, 12).map(scheduledCardProps);
  }, [rows, liveMarketplaceEnabled]);

  const ready = liveMarketplaceEnabled ? rows !== null : true;

  if (!liveMarketplaceEnabled) {
    return (
      <section
        id="upcoming-breaks"
        className="scroll-mt-16 border-b border-white/[0.08] bg-[#020202] py-9 sm:py-11"
        aria-labelledby="upcoming-title"
      >
        <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
          <SectionHeading
            titleId="upcoming-title"
            eyebrow="Calendar"
            title="Upcoming breaks"
            actionLabel="Coming soon"
            actionHref="/coming-soon"
            dense
          />
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-5 py-10 text-center sm:px-8">
            <p className="text-sm font-medium text-zinc-300">Scheduled shows will appear here when live launches.</p>
            <p className="mt-2 text-xs text-zinc-500">Same timeline as live rooms—we will post the calendar as soon as sellers can go live.</p>
            <Link
              href="/coming-soon"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
            >
              Live — coming soon
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="upcoming-breaks"
      className="scroll-mt-16 border-b border-white/[0.08] bg-[#020202] py-9 sm:py-11"
      aria-labelledby="upcoming-title"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
        <SectionHeading
          titleId="upcoming-title"
          eyebrow="Calendar"
          title="Upcoming breaks"
          actionLabel="Full schedule"
          actionHref="/live"
          dense
        />
        {!ready ? (
          <div className="market-scroll flex gap-2.5 overflow-x-auto pb-1 pt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[118px] w-[min(100%,290px)] shrink-0 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.04] motion-reduce:animate-none"
                aria-hidden
              />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <div className="market-scroll flex gap-2.5 overflow-x-auto pb-1 pt-1">
            {cards.map((u) => (
              <UpcomingBreakCard key={u.seed} {...u} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-5 py-10 text-center sm:px-8">
            <p className="text-sm font-medium text-zinc-300">No scheduled shows right now</p>
            <p className="mt-2 text-xs text-zinc-500">
              When sellers schedule live rooms, they will show up here and on the live directory.
            </p>
            <Link
              href="/live"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-6 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
            >
              Browse live
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
