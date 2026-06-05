"use client";

import type { ReactNode } from "react";

/** Wraps the desktop active-item + CTA block below the video plate. */
export function BuyerLiveDesktopCommerce({ children }: { children: ReactNode }) {
  return (
    <div className="buyer-live-desktop-commerce rounded-lg border border-zinc-800/90 bg-zinc-950/95 p-2 shadow-[0_8px_32px_-16px_rgba(0,0,0,0.85)] [&_.live-desktop-action-hud]:p-0 [&_.live-desktop-action-hud_.flex]:flex-col [&_.live-desktop-action-hud_.flex]:items-stretch [&_.live-desktop-action-hud_button]:w-full">
      {children}
    </div>
  );
}
