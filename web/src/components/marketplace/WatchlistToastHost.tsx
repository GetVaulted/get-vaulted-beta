"use client";

import { useEffect, useRef, useState } from "react";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

export function WatchlistToastHost() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message;
      if (typeof msg !== "string" || !msg) return;
      if (timer.current) clearTimeout(timer.current);
      setToast(msg);
      timer.current = setTimeout(() => {
        setToast(null);
        timer.current = null;
      }, 2800);
    };
    window.addEventListener(WATCHLIST_TOAST_EVENT, on as EventListener);
    return () => {
      window.removeEventListener(WATCHLIST_TOAST_EVENT, on as EventListener);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom,0px)+4.5rem)] left-1/2 z-[120] w-[min(90vw,20rem)] -translate-x-1/2 rounded-xl border border-white/[0.12] bg-[#111114]/95 px-4 py-2.5 text-center text-xs font-semibold text-zinc-100 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.85)] backdrop-blur-md"
    >
      {toast}
    </div>
  );
}
