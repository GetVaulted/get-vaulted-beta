"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { RT_EVENT, userNotificationsChannel } from "@/lib/realtime-channels";

export function useRealtimeUserNotificationsSubscription(userId: string | null, enabled = true): void {
  useEffect(() => {
    if (!enabled || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const name = userNotificationsChannel(userId);
    const channel = supabase.channel(name).on("broadcast", { event: RT_EVENT.notification }, () => {
      window.dispatchEvent(new Event("gv-notifications-updated"));
    });

    if (process.env.NEXT_PUBLIC_SUPABASE_ENABLE_POSTGRES_REALTIME === "true") {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
        () => {
          window.dispatchEvent(new Event("gv-notifications-updated"));
        },
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled]);
}
