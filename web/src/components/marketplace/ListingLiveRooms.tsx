"use client";

import { useEffect, useState } from "react";
import { LiveNowRoomCard } from "@/components/cards/LiveNowRoomCard";
import type { LiveNowRoom } from "@/content/live-rooms";
import { mapApiRowToLiveNowRoom, type LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";
import { getLiveCardSignals } from "@/lib/live-signals";

type ListingLiveRoomsProps = {
  listingId: string;
};

export function ListingLiveRooms({ listingId }: ListingLiveRoomsProps) {
  const [rooms, setRooms] = useState<LiveNowRoom[]>([]);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`/api/live-rooms?listingId=${encodeURIComponent(listingId)}&limit=8`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { rooms?: LiveRoomListApiRow[] };
      setRooms((Array.isArray(j.rooms) ? j.rooms : []).map(mapApiRowToLiveNowRoom));
    };
    void run();
  }, [listingId]);

  if (rooms.length === 0) return null;

  return (
    <section className="mt-5 border-t border-white/[0.07] pt-5" aria-labelledby="listing-live-rooms">
      <h2 id="listing-live-rooms" className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
        Live from this seller
      </h2>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:thin]">
        {rooms.map((room) => (
          <div key={room.id} className="w-[min(200px,78vw)] shrink-0 sm:w-[210px]">
            <LiveNowRoomCard room={room} muted dynamicSignals={getLiveCardSignals(room)} />
          </div>
        ))}
      </div>
    </section>
  );
}
