"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

const HEARTBEAT_MS = 45_000;

/**
 * Signed-in web clients ping presence while the tab is visible so admin
 * Command Center can show “online now” (web bucket).
 */
export function AppPresenceHeartbeat() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    let intervalId: number | null = null;

    const ping = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "web" }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        /* ignore transient network errors */
      });
    };

    const start = () => {
      ping();
      if (intervalId != null) window.clearInterval(intervalId);
      intervalId = window.setInterval(ping, HEARTBEAT_MS);
    };

    const stop = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  return null;
}
