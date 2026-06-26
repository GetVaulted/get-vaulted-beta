"use client";

import { useCallback, useEffect, useState } from "react";
import { canonicalLiveRoomUrl } from "@/lib/live-room-share-metadata";
import { isMobileWebUserAgent, mobileWebPlatform } from "@/lib/mobile-browser-detect";
import { liveRoomCustomSchemeUrl } from "@/lib/universal-app-links";

const DISMISS_SESSION_KEY = "gv-live-open-app-dismiss";

type LiveOpenInAppBannerProps = {
  roomId: string;
};

/** Sticky mobile-web CTA — complements iOS Smart App Banner and Universal Links. */
export function LiveOpenInAppBanner({ roomId }: LiveOpenInAppBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileWebUserAgent(navigator.userAgent)) return;
    if (sessionStorage.getItem(DISMISS_SESSION_KEY) === "1") return;
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
    setVisible(false);
  }, []);

  const openApp = useCallback(() => {
    if (typeof window === "undefined") return;
    const platform = mobileWebPlatform(navigator.userAgent);
    const storeUrl = appStoreUrlForPlatform(platform) ?? "/app";
    const schemeUrl = liveRoomCustomSchemeUrl(roomId);

    window.location.href = schemeUrl;
    window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      window.location.assign(storeUrl);
    }, 1200);
  }, [roomId]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden"
      role="region"
      aria-label="Open in app"
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-gold/30 bg-zinc-950/95 px-3 py-2.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold-bright">Get Vaulted app</p>
          <p className="truncate text-sm text-zinc-100">Open this show in the app for the best experience</p>
        </div>
        <button
          type="button"
          onClick={openApp}
          className="shrink-0 rounded-full bg-gradient-to-r from-gold to-gold-bright px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-950"
        >
          Open
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full px-2 py-2 text-lg leading-none text-zinc-400"
          aria-label="Dismiss open in app banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
