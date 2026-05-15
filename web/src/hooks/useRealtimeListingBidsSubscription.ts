"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { listingBidsChannel, RT_EVENT } from "@/lib/realtime-channels";

export function useRealtimeListingBidsSubscription(
  listingId: string | null,
  onBid: () => void | Promise<void>,
  enabled = true,
): void {
  const onBidRef = useRef(onBid);
  useLayoutEffect(() => {
    onBidRef.current = onBid;
  }, [onBid]);

  useEffect(() => {
    if (!enabled || !listingId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const name = listingBidsChannel(listingId);
    const channel = supabase
      .channel(name)
      .on("broadcast", { event: RT_EVENT.listingBid }, ({ payload }) => {
        const lid = (payload as { listingId?: string } | null)?.listingId;
        if (lid === listingId) void onBidRef.current();
      });

    if (process.env.NEXT_PUBLIC_SUPABASE_ENABLE_POSTGRES_REALTIME === "true") {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Bid", filter: `listingId=eq.${listingId}` },
        () => void onBidRef.current(),
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listingId, enabled]);
}
